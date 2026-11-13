# T3 Code icon

These files are extracted from the T3 Code desktop app's `icon.icns` so the
Rich Presence card can use the same mark as the app.

| File | Size | Use |
| --- | --- | --- |
| `t3code-icon.png` | 512 × 512 | Discord Art Asset (key `logo`) |
| `t3code-icon-128.png` | 128 × 128 | Small icon / docs |

T3 Code is MIT licensed by T3 Tools Inc. This project is independent and is
not affiliated with T3 Tools. If the T3 Code mark changes, re-extract it from
the installed app:

```bash
iconutil -c iconset "/Applications/T3 Code.app/Contents/Resources/icon.icns" -o /tmp/t3code.iconset
cp /tmp/t3code.iconset/icon_512x512.png assets/t3code-icon.png
```
