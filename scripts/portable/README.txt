PIANO LEARNING PORTABLE
=======================

Requirements
------------
- Windows 10 or Windows 11
- Microsoft Edge or Google Chrome
- Your MIDI keyboard's normal Windows driver, if it requires one

No Node.js, npm, development tools, installation, or administrator access is required.

Start the app
-------------
1. Extract the complete ZIP to a normal folder. Do not run it from inside the ZIP preview.
2. Double-click "Start Piano.bat".
3. Keep the console window open while using Piano Learning.
4. Edge or Chrome should open http://127.0.0.1:4173/ automatically.
5. Open Settings in the app, connect MIDI, and allow browser MIDI permission when asked.
6. Use Open Score to choose a .mxl, .musicxml, or .xml file from this computer.

Stop the app
------------
Close the Piano Learning console window or press Ctrl+C in it. The browser tab can then be closed.

Troubleshooting
---------------
- If Windows shows a security prompt, choose the option to run the local launcher only if you received this package from a trusted source.
- If the app reports that port 4173 is busy, close another Piano Learning console or the program using that port, then try again.
- If MIDI is unavailable, confirm the page address starts with http://127.0.0.1:4173 and that it opened in Edge or Chrome.
- If the launcher says the packaged app is missing, extract the entire ZIP again and keep the app folder beside the launcher.
- Closing the console stops the local server; double-click the launcher again to restart it.

Privacy and networking
----------------------
The included server listens only on this computer at 127.0.0.1. Other computers cannot connect to it. The current app reads selected scores locally and does not upload them.

Build identification
--------------------
See VERSION.txt when reporting a test result or problem.
