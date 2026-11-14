# T3 Code icon

These files come from the T3 Code desktop app's `icon.icns`. The card uses them as the app icon.

| File | Size | Use |
| --- | --- | --- |
| `t3code-icon.png` | 512x512 | Discord Art Asset with the key `logo` |
| `t3code-icon-128.png` | 128x128 | Small icon or docs |

T3 Code is MIT licensed by T3 Tools Inc. If the T3 Code icon changes, extract it again from the installed app:

```bash
iconutil -c iconset "/Applications/T3 Code.app/Contents/Resources/icon.icns" -o /tmp/t3code.iconset
cp /tmp/t3code.iconset/icon_512x512.png assets/t3code-icon.png
```
