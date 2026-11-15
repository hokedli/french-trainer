' Double-click this to start (or bring back) French Keys without a console window.
' Pass -StartHidden (as the Windows startup shortcut does) to load it silently, waiting for a Right Alt tap.
Set shell = CreateObject("WScript.Shell")
scriptFolder = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
extraArguments = ""
If WScript.Arguments.Count > 0 Then extraArguments = " " & WScript.Arguments(0)
shell.Run "powershell.exe -NoProfile -STA -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & scriptFolder & "\FrenchKeys.ps1""" & extraArguments, 0, False
