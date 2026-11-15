# French Keys

A tiny always-on-top strip of French characters for typing on an English keyboard. It's for Windows, works offline and needs no install.

## Start
Double-click `FrenchKeys.vbs`.

## Use
- **Click** a letter to type it straight into your app, where your cursor is. Your app stays focused.
- **Right-click** a letter to type it in uppercase. **Shift** and **Caps Lock** work like on a real keyboard (with a click, Enter, Space or Ctrl+C): either one gives uppercase, Shift with Caps Lock on gives lowercase. The **⇧** toggle counts as Caps Lock.
- **⇧** switches all letters to uppercase. **⇅** rotates the strip (swaps width and height).
- **≡** drag to move. **Drag any edge or corner** to resize; the buttons grow and rearrange into rows and columns to fill the space. **Right-click the small empty square** to go back to the default size.
- **×** hides the strip. **Right-click ×** quits completely.
- **Tap Right Alt (AltGr)** on its own to bring the strip back where it was. If it's open but hidden behind another window, the same tap raises it back on top. Either way it starts in keyboard mode (see below).

## Keyboard mode
Click the small empty square (or tap Right Alt), then:
- **Arrow keys**: move between buttons (Up/Down jump a row when there are several)
- **Enter / Space**: press the button (letters get typed into the app you were in)
- **Ctrl+C**: type the letter
- **Esc**: hide

Tap **Right Alt** again to leave keyboard mode and go back to your app with the cursor where it was, or click anywhere outside the strip.

## Start with Windows (optional)
Press Win+R, type `shell:startup` and create a shortcut there with this target:
```
wscript.exe "<this folder>\FrenchKeys.vbs" -StartHidden
```
It then loads hidden at login, ready for Right Alt. Delete the shortcut to undo.

## Customize
Edit the character list at the top of `FrenchKeys.ps1`.
