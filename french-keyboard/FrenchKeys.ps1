# French Keys: a tiny always-on-top strip of French special characters.
# Left-click a key to type it into the app you were typing in; right-click types its uppercase form.
# The window never takes focus, so the character lands where your cursor is.
# Drag any edge or corner to resize; the keys rearrange into the rows and columns that fit them best.
# Keyboard mode: click the small empty square, then arrows to move, Enter/Space/Ctrl+C to use a key, Esc to hide.
# Closing only hides the strip; tapping Right Alt (AltGr) on its own brings it back where it was,
# or, if another window has covered it, raises it back on top. Either way it starts keyboard mode.
# Tapping Right Alt again during keyboard mode ends it and puts you back in your app with the cursor where it was.
# Characters are written as code points so this file stays pure ASCII (PowerShell 5.1 misreads UTF-8 without BOM).

param(
    # Used by the Windows startup shortcut: load silently and wait for a Right Alt tap.
    [switch]$StartHidden
)

Add-Type -AssemblyName PresentationFramework, PresentationCore, WindowsBase

$singleInstanceMutex = New-Object System.Threading.Mutex -ArgumentList $false, 'Local\FrenchKeysWidget'
$showRequestSignal = New-Object System.Threading.EventWaitHandle -ArgumentList $false, ([System.Threading.EventResetMode]::AutoReset), 'Local\FrenchKeysShowRequest'
try { $isFirstInstance = $singleInstanceMutex.WaitOne(0) } catch [System.Threading.AbandonedMutexException] { $isFirstInstance = $true }
if (-not $isFirstInstance) {
    # Already running (maybe hidden): ask that instance to show itself instead of opening a second strip.
    if (-not $StartHidden) { $showRequestSignal.Set() | Out-Null }
    exit
}

Add-Type @"
using System;
using System.ComponentModel;
using System.Runtime.InteropServices;

public static class NativeWindowStyle {
    [DllImport("user32.dll")] public static extern int GetWindowLong(IntPtr windowHandle, int index);
    [DllImport("user32.dll")] public static extern int SetWindowLong(IntPtr windowHandle, int index, int newLong);
    [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr windowHandle, IntPtr insertAfterHandle, int x, int y, int width, int height, uint flags);
}

public static class ForegroundWindowControl {
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr windowHandle);
    [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr windowHandle);
    [DllImport("user32.dll")] private static extern uint GetWindowThreadProcessId(IntPtr windowHandle, IntPtr processIdPointer);
    [DllImport("user32.dll")] private static extern bool AttachThreadInput(uint attachingThreadId, uint attachedToThreadId, bool shouldAttach);
    [DllImport("kernel32.dll")] private static extern uint GetCurrentThreadId();

    // Windows only lets the app that received the latest input take the foreground. Briefly sharing
    // input state with the current foreground app's thread grants that right. Returns whether it worked.
    public static bool TakeForeground(IntPtr windowHandle) {
        uint foregroundThreadId = GetWindowThreadProcessId(GetForegroundWindow(), IntPtr.Zero);
        uint ownThreadId = GetCurrentThreadId();
        bool isAttached = foregroundThreadId != 0 && foregroundThreadId != ownThreadId && AttachThreadInput(ownThreadId, foregroundThreadId, true);
        try { SetForegroundWindow(windowHandle); }
        finally { if (isAttached) AttachThreadInput(ownThreadId, foregroundThreadId, false); }
        return GetForegroundWindow() == windowHandle;
    }
}

// Reads the real keyboard even though the strip itself never has the focus.
public static class KeyboardModifierState {
    [DllImport("user32.dll")] private static extern short GetAsyncKeyState(int virtualKey);
    [DllImport("user32.dll")] private static extern short GetKeyState(int virtualKey);
    private const int ShiftVirtualKey = 0x10;
    private const int CapsLockVirtualKey = 0x14;
    public static bool IsShiftHeld() { return (GetAsyncKeyState(ShiftVirtualKey) & 0x8000) != 0; }
    public static bool IsCapsLockOn() { return (GetKeyState(CapsLockVirtualKey) & 0x1) != 0; }
}

// Types text into whichever app has the keyboard focus, as if it came from the keyboard.
public static class UnicodeTextTyper {
    [StructLayout(LayoutKind.Sequential)]
    private struct KeyboardInput { public ushort VirtualKey; public ushort ScanCode; public uint Flags; public uint Time; public IntPtr ExtraInfo; }
    // Never sent; only here so the union has the size Windows expects (mouse input is the largest member).
    [StructLayout(LayoutKind.Sequential)]
    private struct MouseInput { public int X; public int Y; public uint MouseData; public uint Flags; public uint Time; public IntPtr ExtraInfo; }
    [StructLayout(LayoutKind.Explicit)]
    private struct InputUnion { [FieldOffset(0)] public MouseInput Mouse; [FieldOffset(0)] public KeyboardInput Keyboard; }
    [StructLayout(LayoutKind.Sequential)]
    private struct Input { public uint Type; public InputUnion Data; }

    [DllImport("user32.dll", SetLastError = true)] private static extern uint SendInput(uint inputCount, Input[] inputs, int inputSize);
    [DllImport("user32.dll")] private static extern short GetAsyncKeyState(int virtualKey);

    private const uint KeyboardInputType = 1;
    private const uint KeyUpEventFlag = 0x2;
    private const uint UnicodeEventFlag = 0x4;
    private const int ControlVirtualKey = 0x11;
    private const ushort LeftControlVirtualKey = 0xA2;
    private const ushort RightControlVirtualKey = 0xA3;

    private static Input NewKeyboardInput(ushort virtualKey, ushort scanCode, uint flags) {
        Input input = new Input();
        input.Type = KeyboardInputType;
        input.Data.Keyboard.VirtualKey = virtualKey;
        input.Data.Keyboard.ScanCode = scanCode;
        input.Data.Keyboard.Flags = flags;
        return input;
    }

    // Returns whether Windows accepted every key event.
    public static bool TypeText(string text) {
        var inputs = new System.Collections.Generic.List<Input>();
        // Ctrl is still held after Ctrl+C in keyboard mode; release it so apps don't read the character as a shortcut and drop it.
        bool isControlHeld = (GetAsyncKeyState(ControlVirtualKey) & 0x8000) != 0;
        if (isControlHeld) {
            inputs.Add(NewKeyboardInput(LeftControlVirtualKey, 0, KeyUpEventFlag));
            inputs.Add(NewKeyboardInput(RightControlVirtualKey, 0, KeyUpEventFlag));
        }
        foreach (char textCharacter in text) {
            inputs.Add(NewKeyboardInput(0, textCharacter, UnicodeEventFlag));
            inputs.Add(NewKeyboardInput(0, textCharacter, UnicodeEventFlag | KeyUpEventFlag));
        }
        uint acceptedInputCount = SendInput((uint)inputs.Count, inputs.ToArray(), Marshal.SizeOf(typeof(Input)));
        return acceptedInputCount == inputs.Count;
    }
}

// Detects Right Alt (AltGr) being pressed and released with no other key in between.
public static class RightAltTapListener {
    private delegate IntPtr LowLevelKeyboardProc(int code, IntPtr messageType, IntPtr keyInfoPointer);

    [StructLayout(LayoutKind.Sequential)]
    private struct KeyboardHookInfo { public int VirtualKeyCode; public int ScanCode; public int Flags; public int Time; public IntPtr ExtraInfo; }

    [DllImport("user32.dll", SetLastError = true)] private static extern IntPtr SetWindowsHookEx(int hookType, LowLevelKeyboardProc callback, IntPtr module, int threadId);
    [DllImport("user32.dll")] private static extern IntPtr CallNextHookEx(IntPtr hook, int code, IntPtr messageType, IntPtr keyInfoPointer);
    [DllImport("kernel32.dll")] private static extern IntPtr GetModuleHandle(string moduleName);
    [DllImport("user32.dll")] private static extern void keybd_event(byte virtualKey, byte scanCode, int flags, IntPtr extraInfo);

    private const int LowLevelKeyboardHookType = 13;
    private const int KeyDownMessage = 0x100;
    private const int SystemKeyDownMessage = 0x104;
    private const byte RightAltVirtualKey = 0xA5;
    private const byte RightAltScanCode = 0x38;
    private const byte UnassignedMaskVirtualKey = 0xE8;
    // Marks the key events this hook injects itself so it can ignore them.
    private static readonly IntPtr OwnInjectionMarker = (IntPtr)0x46524B59;
    private const int ExtendedKeyEventFlag = 0x1;
    private const int KeyUpEventFlag = 0x2;

    private static readonly LowLevelKeyboardProc callbackKeptAliveForGarbageCollector = OnKeyboardEvent;
    private static bool isRightAltDown;
    private static bool wasOtherKeyPressedWhileRightAltDown;

    public static volatile bool WasTapped;

    public static void Start() {
        IntPtr hookHandle = SetWindowsHookEx(LowLevelKeyboardHookType, callbackKeptAliveForGarbageCollector, GetModuleHandle(null), 0);
        if (hookHandle == IntPtr.Zero) throw new Win32Exception(Marshal.GetLastWin32Error(), "Could not install the Right Alt keyboard hook");
    }

    private static IntPtr OnKeyboardEvent(int code, IntPtr messageType, IntPtr keyInfoPointer) {
        if (code >= 0) {
            KeyboardHookInfo keyInfo = (KeyboardHookInfo)Marshal.PtrToStructure(keyInfoPointer, typeof(KeyboardHookInfo));
            bool isOwnInjection = keyInfo.ExtraInfo == OwnInjectionMarker;
            int message = messageType.ToInt32();
            bool isKeyDown = message == KeyDownMessage || message == SystemKeyDownMessage;
            if (!isOwnInjection && keyInfo.VirtualKeyCode == RightAltVirtualKey) {
                if (isKeyDown && !isRightAltDown) {
                    isRightAltDown = true;
                    wasOtherKeyPressedWhileRightAltDown = false;
                } else if (!isKeyDown) {
                    bool wasTap = isRightAltDown && !wasOtherKeyPressedWhileRightAltDown;
                    isRightAltDown = false;
                    if (wasTap) {
                        WasTapped = true;
                        // Replay the release behind a dummy key so the focused app doesn't see a lone Alt tap and open its menu bar.
                        keybd_event(UnassignedMaskVirtualKey, 0, 0, OwnInjectionMarker);
                        keybd_event(UnassignedMaskVirtualKey, 0, KeyUpEventFlag, OwnInjectionMarker);
                        keybd_event(RightAltVirtualKey, RightAltScanCode, ExtendedKeyEventFlag | KeyUpEventFlag, OwnInjectionMarker);
                        return (IntPtr)1;
                    }
                }
            } else if (!isOwnInjection && isKeyDown && isRightAltDown) {
                wasOtherKeyPressedWhileRightAltDown = true;
            }
        }
        return CallNextHookEx(IntPtr.Zero, code, messageType, keyInfoPointer);
    }
}
"@

$lowercaseFrenchCharacterCodePoints = @(
    0x00E9, # e acute
    0x00E8, # e grave
    0x00EA, # e circumflex
    0x00EB, # e diaeresis
    0x00E0, # a grave
    0x00E2, # a circumflex
    0x00E7, # c cedilla
    0x00EE, # i circumflex
    0x00EF, # i diaeresis
    0x00F4, # o circumflex
    0x00F9, # u grave
    0x00FB, # u circumflex
    0x00FC, # u diaeresis
    0x00FF, # y diaeresis
    0x0153, # oe ligature
    0x00E6, # ae ligature
    0x00AB, # left guillemet
    0x00BB, # right guillemet
    0x2019, # typographic apostrophe
    0x20AC  # euro sign
)

# Default is one horizontal row of 24 cells (grip, keyboard-mode square, 22 buttons) about 34x39 each, plus the frame.
$defaultWidgetWidth = 824
$defaultWidgetHeight = 49

$windowXaml = @"
<Window xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"
        xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml"
        Title="French Keys" WindowStyle="None" AllowsTransparency="True" Background="Transparent"
        Topmost="True" ShowInTaskbar="False" ShowActivated="False" ResizeMode="CanResize"
        Width="$defaultWidgetWidth" Height="$defaultWidgetHeight" MinWidth="30" MinHeight="30">
  <!-- Lets every edge and corner resize the borderless window; moving stays on the drag grip. -->
  <WindowChrome.WindowChrome>
    <WindowChrome ResizeBorderThickness="5" CaptionHeight="0" GlassFrameThickness="0" CornerRadius="0" UseAeroCaptionButtons="False"/>
  </WindowChrome.WindowChrome>
  <Window.Resources>
    <Style x:Key="KeyButtonStyle" TargetType="Button">
      <Setter Property="Margin" Value="1"/>
      <Setter Property="Foreground" Value="#E6E6E6"/>
      <Setter Property="Background" Value="#2A2A2A"/>
      <Setter Property="FontSize" Value="14"/>
      <Setter Property="Focusable" Value="False"/>
      <Setter Property="Cursor" Value="Hand"/>
      <Setter Property="BorderBrush" Value="Transparent"/>
      <Setter Property="BorderThickness" Value="1.5"/>
      <Setter Property="Template">
        <Setter.Value>
          <ControlTemplate TargetType="Button">
            <Border x:Name="KeyBorder" Background="{TemplateBinding Background}" CornerRadius="4"
                    BorderBrush="{TemplateBinding BorderBrush}" BorderThickness="{TemplateBinding BorderThickness}">
              <ContentPresenter HorizontalAlignment="Center" VerticalAlignment="Center"/>
            </Border>
            <ControlTemplate.Triggers>
              <Trigger Property="IsMouseOver" Value="True">
                <Setter TargetName="KeyBorder" Property="Background" Value="#3D3D3D"/>
              </Trigger>
              <Trigger Property="Tag" Value="active">
                <Setter TargetName="KeyBorder" Property="Background" Value="#3A5A8C"/>
              </Trigger>
              <Trigger Property="Tag" Value="typed">
                <Setter TargetName="KeyBorder" Property="Background" Value="#2E7D32"/>
              </Trigger>
              <Trigger Property="Tag" Value="failed">
                <Setter TargetName="KeyBorder" Property="Background" Value="#B23B3B"/>
              </Trigger>
            </ControlTemplate.Triggers>
          </ControlTemplate>
        </Setter.Value>
      </Setter>
    </Style>
  </Window.Resources>
  <Border x:Name="WidgetFrame" Background="#1A1A1A" BorderBrush="#3A3A3A" BorderThickness="1" CornerRadius="6" Padding="4" Opacity="0.95">
    <!-- Filled row by row, left to right; Update-KeyGridLayout picks the column count. -->
    <UniformGrid x:Name="KeyGrid"/>
  </Border>
</Window>
"@

$window = [Windows.Markup.XamlReader]::Parse($windowXaml)
$keyGrid = $window.FindName('KeyGrid')
$widgetFrame = $window.FindName('WidgetFrame')
$keyButtonStyle = $window.Resources['KeyButtonStyle']
$isUppercaseMode = $false
$isKeyboardModeActive = $false
# Keyboard mode gives the strip the focus, so it remembers which app to type into.
$appToTypeIntoWindowHandle = [IntPtr]::Zero
$isHandingFocusBackToTypeCharacter = $false
$selectedButtonIndex = 0
$keyboardModeHighlightColor = '#4A8FE7'
$widgetPlacementFilePath = Join-Path $env:APPDATA 'FrenchKeys\widget-placement.txt'
$characterKeyButtons = New-Object System.Collections.Generic.List[System.Windows.Controls.Button]
# Every button in strip order; keyboard mode moves through these.
$navigableButtons = New-Object System.Collections.Generic.List[System.Windows.Controls.Button]

$extendedStyleIndex = -20
$noActivateStyle = 0x08000000
$toolWindowStyle = 0x00000080
$topmostInsertAfterHandle = [IntPtr](-1)
$keepPositionSizeAndFocusFlags = 0x0001 -bor 0x0002 -bor 0x0010  # SWP_NOSIZE | SWP_NOMOVE | SWP_NOACTIVATE

function Set-WindowNeverTakesFocus([bool]$neverTakesFocus) {
    $windowHandle = (New-Object System.Windows.Interop.WindowInteropHelper $window).Handle
    $currentExtendedStyle = [NativeWindowStyle]::GetWindowLong($windowHandle, $extendedStyleIndex)
    $newExtendedStyle = if ($neverTakesFocus) { $currentExtendedStyle -bor $noActivateStyle } else { $currentExtendedStyle -band (-bnot $noActivateStyle) }
    [NativeWindowStyle]::SetWindowLong($windowHandle, $extendedStyleIndex, $newExtendedStyle) | Out-Null
}

function Get-CharacterForCurrentMode([string]$lowercaseCharacter) {
    if ($script:isUppercaseMode) { return $lowercaseCharacter.ToUpper() }
    return $lowercaseCharacter
}

# Like a real keyboard: Caps Lock (or the strip's own uppercase toggle) locks capitals, and Shift flips the case.
function Get-CharacterToType([string]$lowercaseCharacter) {
    $isCapitalsLocked = $script:isUppercaseMode -or [KeyboardModifierState]::IsCapsLockOn()
    $isUppercaseWanted = $isCapitalsLocked -xor [KeyboardModifierState]::IsShiftHeld()
    if ($isUppercaseWanted) { return $lowercaseCharacter.ToUpper() }
    return $lowercaseCharacter
}

function Update-KeyboardModeHighlight {
    for ($buttonIndex = 0; $buttonIndex -lt $navigableButtons.Count; $buttonIndex++) {
        $isSelected = $script:isKeyboardModeActive -and $buttonIndex -eq $script:selectedButtonIndex
        $navigableButtons[$buttonIndex].BorderBrush = if ($isSelected) { $keyboardModeHighlightColor } else { 'Transparent' }
    }
    $widgetFrame.BorderBrush = if ($script:isKeyboardModeActive) { $keyboardModeHighlightColor } else { '#3A3A3A' }
}

# While keyboard mode is on the strip is a normal focusable window, so Windows reliably
# deactivates it on any click outside; the never-takes-focus style returns when it ends.
function Enter-KeyboardMode {
    $ownWindowHandle = (New-Object System.Windows.Interop.WindowInteropHelper $window).Handle
    $foregroundWindowHandle = [ForegroundWindowControl]::GetForegroundWindow()
    if ($foregroundWindowHandle -ne $ownWindowHandle) { $script:appToTypeIntoWindowHandle = $foregroundWindowHandle }
    Set-WindowNeverTakesFocus $false
    $window.Activate() | Out-Null
    $window.Focus() | Out-Null
    $script:isKeyboardModeActive = $true
    Update-KeyboardModeHighlight
}

function Exit-KeyboardMode {
    $script:isKeyboardModeActive = $false
    Set-WindowNeverTakesFocus $true
    Update-KeyboardModeHighlight
}

# Used by the Right Alt tap during keyboard mode: the app you were typing in gets the focus back, cursor and all.
function Exit-KeyboardModeAndReturnToApp {
    $returnFocusAfterTypingTimer.Stop()
    $script:isHandingFocusBackToTypeCharacter = $false
    Exit-KeyboardMode
    if ([ForegroundWindowControl]::IsWindow($script:appToTypeIntoWindowHandle)) {
        [ForegroundWindowControl]::SetForegroundWindow($script:appToTypeIntoWindowHandle) | Out-Null
    }
}

function Save-WidgetPlacement {
    New-Item -ItemType Directory -Force (Split-Path $widgetPlacementFilePath) | Out-Null
    Set-Content -Path $widgetPlacementFilePath -Value "$([int]$window.Left);$([int]$window.Top);$([int]$window.Width);$([int]$window.Height)"
}

# Returns $true when a usable saved placement was applied.
function Restore-WidgetPlacement {
    if (-not (Test-Path $widgetPlacementFilePath)) { return $false }
    $savedPlacementParts = (Get-Content $widgetPlacementFilePath -Raw).Trim() -split ';'
    $savedLeft, $savedTop = $savedPlacementParts
    $isOnScreen = [int]$savedLeft -ge [System.Windows.SystemParameters]::VirtualScreenLeft -and
                  [int]$savedTop -ge [System.Windows.SystemParameters]::VirtualScreenTop -and
                  [int]$savedLeft -lt [System.Windows.SystemParameters]::VirtualScreenLeft + [System.Windows.SystemParameters]::VirtualScreenWidth - 20 -and
                  [int]$savedTop -lt [System.Windows.SystemParameters]::VirtualScreenTop + [System.Windows.SystemParameters]::VirtualScreenHeight - 20
    # A monitor that was unplugged since the last save would leave the strip unreachable.
    if (-not $isOnScreen) { return $false }
    $window.Left = [int]$savedLeft
    $window.Top = [int]$savedTop
    # Files saved before resizing existed hold an orientation instead of a size; those keep the default size.
    if ($savedPlacementParts.Count -eq 4) {
        $window.Width = [int]$savedPlacementParts[2]
        $window.Height = [int]$savedPlacementParts[3]
    }
    return $true
}

# Other always-on-top windows can end up above the strip; re-inserting it at the top of the
# topmost band puts it back over everything without moving it or stealing focus.
function Bring-WidgetToFront {
    $windowHandle = (New-Object System.Windows.Interop.WindowInteropHelper $window).Handle
    $wasRaised = [NativeWindowStyle]::SetWindowPos($windowHandle, $topmostInsertAfterHandle, 0, 0, 0, 0, $keepPositionSizeAndFocusFlags)
    if (-not $wasRaised) { throw "Could not bring the French Keys strip to the front" }
}

# Used both to bring back a hidden strip and to raise a visible one that got covered; position is kept.
function Show-Widget {
    $window.Show()
    Bring-WidgetToFront
}

function Hide-Widget {
    Save-WidgetPlacement
    $window.Hide()
}

function Stop-FrenchKeys {
    Save-WidgetPlacement
    $window.Dispatcher.InvokeShutdown()
}

# Text is normally centred by its line box, which includes empty space above and below the letters,
# so labels are drawn as their outline instead and centred by the ink itself.
$labelTypeface = New-Object System.Windows.Media.Typeface 'Segoe UI'
function New-CenteredGlyph([string]$text, [double]$fontSize, $brush) {
    $pixelsPerDip = [System.Windows.Media.VisualTreeHelper]::GetDpi($window).PixelsPerDip
    $formattedText = New-Object System.Windows.Media.FormattedText $text, ([System.Globalization.CultureInfo]::CurrentUICulture), ([System.Windows.FlowDirection]::LeftToRight), $labelTypeface, $fontSize, $brush, $pixelsPerDip
    $glyphOutline = $formattedText.BuildGeometry((New-Object System.Windows.Point 0, 0))
    $inkBounds = $glyphOutline.Bounds
    $glyphOutline.Transform = New-Object System.Windows.Media.TranslateTransform (-$inkBounds.X), (-$inkBounds.Y)
    $glyphShape = New-Object System.Windows.Shapes.Path
    $glyphShape.Data = $glyphOutline
    $glyphShape.Fill = $brush
    $glyphShape.HorizontalAlignment = 'Center'
    $glyphShape.VerticalAlignment = 'Center'
    return $glyphShape
}

# The label text lives in the button's accessible name, so it can be redrawn at any size.
function Set-ButtonLabel($button, [string]$labelText) {
    [System.Windows.Automation.AutomationProperties]::SetName($button, $labelText)
    $button.Content = New-CenteredGlyph $labelText $button.FontSize $button.Foreground
}

function New-KeyButton([string]$label, [string]$toolTip) {
    $button = New-Object System.Windows.Controls.Button
    $button.Style = $keyButtonStyle
    Set-ButtonLabel $button $label
    $button.ToolTip = $toolTip
    $keyGrid.Children.Add($button) | Out-Null
    $navigableButtons.Add($button)
    return $button
}

# Typed keys reach the app before the strip takes the focus back only if it waits a moment.
$returnFocusAfterTypingTimer = New-Object System.Windows.Threading.DispatcherTimer
$returnFocusAfterTypingTimer.Interval = [TimeSpan]::FromMilliseconds(100)
$returnFocusAfterTypingTimer.Add_Tick({
    $returnFocusAfterTypingTimer.Stop()
    $ownWindowHandle = (New-Object System.Windows.Interop.WindowInteropHelper $window).Handle
    $hasTakenFocusBack = [ForegroundWindowControl]::TakeForeground($ownWindowHandle)
    $script:isHandingFocusBackToTypeCharacter = $false
    if ($hasTakenFocusBack) { $window.Focus() | Out-Null } else { Exit-KeyboardMode }
})

# Returns whether the character was typed.
function Send-CharacterToAppBeingTypedIn([string]$character) {
    # Outside keyboard mode the strip never has the focus, so the app being typed in still does.
    if (-not $script:isKeyboardModeActive) { return [UnicodeTextTyper]::TypeText($character) }
    # In keyboard mode the strip holds the focus: lend it back to that app, type, then take it back.
    if (-not [ForegroundWindowControl]::IsWindow($script:appToTypeIntoWindowHandle)) { return $false }
    $script:isHandingFocusBackToTypeCharacter = $true
    $hasHandedFocusBack = [ForegroundWindowControl]::SetForegroundWindow($script:appToTypeIntoWindowHandle)
    $wasTyped = $hasHandedFocusBack -and [UnicodeTextTyper]::TypeText($character)
    $returnFocusAfterTypingTimer.Stop()
    $returnFocusAfterTypingTimer.Start()
    return $wasTyped
}

# Types the character and flashes the key: green when typed, red when it failed, so a miss is never silent.
function Invoke-CharacterKey($button, [string]$character) {
    $wasTyped = Send-CharacterToAppBeingTypedIn $character
    $button.Tag = if ($wasTyped) { 'typed' } else { 'failed' }
    $flashResetTimer = New-Object System.Windows.Threading.DispatcherTimer
    $flashResetTimer.Interval = [TimeSpan]::FromMilliseconds(300)
    $flashResetTimer.Add_Tick({ $button.Tag = $null; $flashResetTimer.Stop() }.GetNewClosure())
    $flashResetTimer.Start()
}

# The grip fills its whole grid cell so the drag target grows with the widget.
$dragGripSymbol = [string][char]0x2261
$dragGripSymbolBrush = New-Object System.Windows.Media.SolidColorBrush ([System.Windows.Media.Color]::FromRgb(0x77, 0x77, 0x77))
$dragGrip = New-Object System.Windows.Controls.Border
$dragGrip.Background = 'Transparent'
$dragGrip.Cursor = 'SizeAll'
$dragGrip.ToolTip = 'Drag to move'
# Moved by hand instead of DragMove: Windows' own move loop would snap the resizable strip
# to half or full screen when it touches a screen edge or corner.
$dragGrip.Add_MouseLeftButtonDown({
    $script:cursorOffsetInsideWindowAtDragStart = $_.GetPosition($window)
    $dragGrip.CaptureMouse() | Out-Null
    $_.Handled = $true
})
$dragGrip.Add_MouseMove({
    if (-not $dragGrip.IsMouseCaptured) { return }
    $cursorOnScreenInPixels = $window.PointToScreen($_.GetPosition($window))
    $pixelsToWindowUnits = [System.Windows.PresentationSource]::FromVisual($window).CompositionTarget.TransformFromDevice
    $cursorOnScreen = $pixelsToWindowUnits.Transform($cursorOnScreenInPixels)
    $window.Left = $cursorOnScreen.X - $script:cursorOffsetInsideWindowAtDragStart.X
    $window.Top = $cursorOnScreen.Y - $script:cursorOffsetInsideWindowAtDragStart.Y
})
$dragGrip.Add_MouseLeftButtonUp({
    if (-not $dragGrip.IsMouseCaptured) { return }
    $dragGrip.ReleaseMouseCapture()
    Save-WidgetPlacement
})
$keyGrid.Children.Add($dragGrip) | Out-Null

$keyboardModeSpot = New-Object System.Windows.Controls.Border
$keyboardModeSpot.CornerRadius = '3'
$keyboardModeSpot.Background = '#242424'
$keyboardModeSpot.BorderBrush = '#4A4A4A'
$keyboardModeSpot.BorderThickness = '1'
$keyboardModeSpot.Cursor = 'Hand'
$keyboardModeSpot.ToolTip = 'Click for keyboard mode: arrows move, Enter/Space/Ctrl+C use a key, Esc hides. Right Alt or click outside to stop.  |  Right-click: reset to default size'
$keyboardModeSpot.Add_MouseLeftButtonDown({ Enter-KeyboardMode })
$keyboardModeSpot.Add_MouseRightButtonUp({
    $window.Width = $defaultWidgetWidth
    $window.Height = $defaultWidgetHeight
    Save-WidgetPlacement
    $_.Handled = $true
})
$keyGrid.Children.Add($keyboardModeSpot) | Out-Null

$rotateButton = New-KeyButton ([string][char]0x21C5) 'Rotate: swap width and height'
$rotateButton.Add_Click({
    $previousWidth = $window.Width
    $window.Width = $window.Height
    $window.Height = $previousWidth
    Save-WidgetPlacement
})

$uppercaseToggleButton = New-KeyButton ([string][char]0x21E7) 'Toggle uppercase (or right-click any key)'
$uppercaseToggleButton.Add_Click({
    $script:isUppercaseMode = -not $script:isUppercaseMode
    $uppercaseToggleButton.Tag = if ($script:isUppercaseMode) { 'active' } else { $null }
    foreach ($characterKeyButton in $characterKeyButtons) {
        Set-ButtonLabel $characterKeyButton (Get-CharacterForCurrentMode $characterKeyButton.DataContext)
    }
})

foreach ($codePoint in $lowercaseFrenchCharacterCodePoints) {
    $lowercaseCharacter = [string][char]$codePoint
    $characterKeyButton = New-KeyButton $lowercaseCharacter 'Click: type  |  Right-click: type uppercase'
    $characterKeyButton.DataContext = $lowercaseCharacter
    $characterKeyButton.Add_Click({
        Invoke-CharacterKey $this (Get-CharacterToType $this.DataContext)
    })
    $characterKeyButton.Add_PreviewMouseRightButtonUp({
        Invoke-CharacterKey $this $this.DataContext.ToUpper()
        $_.Handled = $true
    })
    $characterKeyButtons.Add($characterKeyButton)
}

$closeButton = New-KeyButton ([string][char]0x00D7) 'Hide (tap Right Alt to bring back)  |  Right-click: quit completely'
$closeButton.Foreground = '#999999'
$closeButton.Add_Click({ Hide-Widget })
$closeButton.Add_PreviewMouseRightButtonUp({
    Stop-FrenchKeys
    $_.Handled = $true
})

# Clicking any button with the mouse during keyboard mode moves the selection there.
foreach ($navigableButton in $navigableButtons) {
    $navigableButton.Add_PreviewMouseLeftButtonDown({
        $script:selectedButtonIndex = $navigableButtons.IndexOf($this)
        Update-KeyboardModeHighlight
    })
}

# Picks the column count that gives the largest square-ish cells for the current window size
# (ties go to fewer empty cells), then scales the symbols to match the cells.
function Update-KeyGridLayout {
    $frameInsetWidth = $widgetFrame.Padding.Left + $widgetFrame.Padding.Right + $widgetFrame.BorderThickness.Left + $widgetFrame.BorderThickness.Right
    $frameInsetHeight = $widgetFrame.Padding.Top + $widgetFrame.Padding.Bottom + $widgetFrame.BorderThickness.Top + $widgetFrame.BorderThickness.Bottom
    $availableWidth = $window.ActualWidth - $frameInsetWidth
    $availableHeight = $window.ActualHeight - $frameInsetHeight
    if ($availableWidth -le 0 -or $availableHeight -le 0) { return }
    $itemCount = $keyGrid.Children.Count
    $bestColumnCount = 1
    $bestCellSide = 0
    $bestEmptyCellCount = [int]::MaxValue
    for ($columnCount = 1; $columnCount -le $itemCount; $columnCount++) {
        $rowCount = [math]::Ceiling($itemCount / $columnCount)
        $cellSide = [math]::Min($availableWidth / $columnCount, $availableHeight / $rowCount)
        $emptyCellCount = $columnCount * $rowCount - $itemCount
        $isClearlyBigger = $cellSide -gt $bestCellSide + 0.5
        $isAboutAsBigWithLessWaste = [math]::Abs($cellSide - $bestCellSide) -le 0.5 -and $emptyCellCount -lt $bestEmptyCellCount
        if ($isClearlyBigger -or $isAboutAsBigWithLessWaste) {
            $bestColumnCount = $columnCount
            $bestCellSide = $cellSide
            $bestEmptyCellCount = $emptyCellCount
        }
    }
    $keyGrid.Columns = $bestColumnCount
    $keyGrid.Rows = [math]::Ceiling($itemCount / $bestColumnCount)
    $cellWidth = $availableWidth / $keyGrid.Columns
    $cellHeight = $availableHeight / $keyGrid.Rows
    $smallerCellSide = [math]::Min($cellWidth, $cellHeight)
    $buttonFontSize = [math]::Max(6, ($smallerCellSide - 2) * 0.75)
    foreach ($navigableButton in $navigableButtons) {
        $navigableButton.FontSize = $buttonFontSize
        Set-ButtonLabel $navigableButton ([System.Windows.Automation.AutomationProperties]::GetName($navigableButton))
    }
    $dragGrip.Child = New-CenteredGlyph $dragGripSymbol ([math]::Max(6, $smallerCellSide * 0.6)) $dragGripSymbolBrush
    $keyboardModeSpot.Width = [math]::Max(6, $smallerCellSide * 0.6)
    $keyboardModeSpot.Height = $keyboardModeSpot.Width
}

# Resizing fires many size changes in a row; save once it has settled.
$saveAfterResizeTimer = New-Object System.Windows.Threading.DispatcherTimer
$saveAfterResizeTimer.Interval = [TimeSpan]::FromMilliseconds(500)
$saveAfterResizeTimer.Add_Tick({
    $saveAfterResizeTimer.Stop()
    Save-WidgetPlacement
})

$window.Add_SizeChanged({
    Update-KeyGridLayout
    if ($window.IsVisible) {
        $saveAfterResizeTimer.Stop()
        $saveAfterResizeTimer.Start()
    }
})

$window.Add_SourceInitialized({
    # WS_EX_TOOLWINDOW hides the strip from Alt+Tab.
    $windowHandle = (New-Object System.Windows.Interop.WindowInteropHelper $window).Handle
    $currentExtendedStyle = [NativeWindowStyle]::GetWindowLong($windowHandle, $extendedStyleIndex)
    [NativeWindowStyle]::SetWindowLong($windowHandle, $extendedStyleIndex, $currentExtendedStyle -bor $toolWindowStyle) | Out-Null
    Set-WindowNeverTakesFocus $true
})

$window.Add_Deactivated({
    # Lending the focus to the app being typed in is not "clicking outside", so keyboard mode stays on.
    if ($script:isKeyboardModeActive -and -not $script:isHandingFocusBackToTypeCharacter) { Exit-KeyboardMode }
})

$window.Add_PreviewKeyDown({
    $keyEventArgs = $_
    if (-not $script:isKeyboardModeActive) { return }
    $buttonCount = $navigableButtons.Count
    $selectedButton = $navigableButtons[$script:selectedButtonIndex]
    $isControlPressed = ([System.Windows.Input.Keyboard]::Modifiers -band [System.Windows.Input.ModifierKeys]::Control) -ne 0
    # Up/Down jump a whole row in the grid; in a single row they step like Left/Right.
    $rowStep = if ($keyGrid.Rows -gt 1) { $keyGrid.Columns } else { 1 }
    if ($keyEventArgs.Key -eq [System.Windows.Input.Key]::Left) {
        $script:selectedButtonIndex = ($script:selectedButtonIndex - 1 + $buttonCount) % $buttonCount
    } elseif ($keyEventArgs.Key -eq [System.Windows.Input.Key]::Right) {
        $script:selectedButtonIndex = ($script:selectedButtonIndex + 1) % $buttonCount
    } elseif ($keyEventArgs.Key -eq [System.Windows.Input.Key]::Up) {
        if ($rowStep -eq 1) { $script:selectedButtonIndex = ($script:selectedButtonIndex - 1 + $buttonCount) % $buttonCount }
        elseif ($script:selectedButtonIndex - $rowStep -ge 0) { $script:selectedButtonIndex -= $rowStep }
    } elseif ($keyEventArgs.Key -eq [System.Windows.Input.Key]::Down) {
        if ($rowStep -eq 1) { $script:selectedButtonIndex = ($script:selectedButtonIndex + 1) % $buttonCount }
        elseif ($script:selectedButtonIndex + $rowStep -lt $buttonCount) { $script:selectedButtonIndex += $rowStep }
    } elseif ($keyEventArgs.Key -in [System.Windows.Input.Key]::Enter, [System.Windows.Input.Key]::Space) {
        $selectedButton.RaiseEvent((New-Object System.Windows.RoutedEventArgs ([System.Windows.Controls.Primitives.ButtonBase]::ClickEvent)))
    } elseif ($keyEventArgs.Key -eq [System.Windows.Input.Key]::C -and $isControlPressed) {
        if ($characterKeyButtons.Contains($selectedButton)) {
            Invoke-CharacterKey $selectedButton (Get-CharacterToType $selectedButton.DataContext)
        }
    } elseif ($keyEventArgs.Key -eq [System.Windows.Input.Key]::Escape) {
        Hide-Widget
    } else {
        return
    }
    $keyEventArgs.Handled = $true
    Update-KeyboardModeHighlight
})

$hasRestoredPlacement = Restore-WidgetPlacement
$window.Add_Loaded({
    if ($hasRestoredPlacement) { return }
    $workArea = [System.Windows.SystemParameters]::WorkArea
    $window.Left = $workArea.Left + ($workArea.Width - $window.ActualWidth) / 2
    $window.Top = $workArea.Top + 8
})

# One cheap timer turns the Right Alt tap and "open again" requests from a second launch into Show-Widget.
$showRequestPollTimer = New-Object System.Windows.Threading.DispatcherTimer
$showRequestPollTimer.Interval = [TimeSpan]::FromMilliseconds(100)
$showRequestPollTimer.Add_Tick({
    $wasRightAltTapped = [RightAltTapListener]::WasTapped
    [RightAltTapListener]::WasTapped = $false
    if ($wasRightAltTapped -and $script:isKeyboardModeActive) {
        Exit-KeyboardModeAndReturnToApp
    } elseif ($wasRightAltTapped) {
        Show-Widget
        Enter-KeyboardMode
    } elseif ($showRequestSignal.WaitOne(0)) {
        Show-Widget
    }
})
$showRequestPollTimer.Start()

[RightAltTapListener]::Start()
if (-not $StartHidden) { Show-Widget }
[System.Windows.Threading.Dispatcher]::Run()
