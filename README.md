#brackets-ci-translate

Brackets.io extension aiming at simplifying translation of CodeIgniter projects.

##How to use

You can do two things with the plugin, you need to "Open Folder" you project first.

###Translate a non-translated string:

1.  Select text you want to translate
2.  Click on `Edit => CITranslate: Translate Text` or press <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>T</kbd>
3.  Enter the key you want to use in the modal then press `Enter`
4.  Enter you translations in the new modal then press `Enter`
5.  Files are now edited, but you must save them in order to apply changes (Or hit <kbd>Ctrl</kbd>+<kbd>Z</kbd> if something is messed up)

###Edit a translation.

1. Place cursor inside the call to `lang('')` function.
2. Click on `Edit => CITranslate: Edit Translation` or press <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>R</kbd>
3.  Enter you translations in the new modal then press `Enter`
4.  Files are now edited, but you must save them in order to apply changes (Or hit <kbd>Ctrl</kbd>+<kbd>Z</kbd> if something is messed up)

###Confguration
You can add a `.citranslate` json file at the root of the folder you open with Brackets, here is an example of configuration:
```json
{
    "language_file": "my_lang",
    "language_folder": "application/language"
}
```
Or if you prefer to open `/application` directly
```json
{
    "language_file": "my_lang",
    "language_folder": "language"
}
```

###Changelog
####v0.1.0
 * Changed shortcuts cause if wasn't working on gnome
 * Allowed changing the language folder path
 * Added support for .citranslate file to specify config

####Donate
Want to pay me a beer, why not with dogecoin ? [DMpRH9DKQHnUTvXYQ6sSqb9UN883WpmzrX](dogecoin:DMpRH9DKQHnUTvXYQ6sSqb9UN883WpmzrX?amount=500&message=brackets-ci-translate&label=korri)

