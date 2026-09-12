# 06 · Restarting the library, reading these files again

*Keep with the disk. For someone who has never seen Arche.*

## What is on this disk
- `library/zim/`: `.zim` files = Wikipedia, health and repair guides… Each `.zim` is a whole compressed website.
- `library/models/`: the local AI's "brains". `library/pdf/`: documents to print. `library/git/`: software source code.
- `library/.arche/state.json`: the list of everything, with dates. `arche/`: the program that manages it all. `README-USB.txt`: short instructions.

## Restart with the program (any computer)
1. Plug the disk in. Open the `arche/` folder.
2. Double-click `arche` (`arche.exe` on Windows). If absent: install **Node.js** (installer in `library/software/` if provided), then in a terminal: `node dist/cli.js serve --library ../library --open`.
3. The browser opens. Click **Open the library**.

## If the program no longer works: read the `.zim` files directly
- Install **Kiwix** (in `library/software/`: kiwix-desktop AppImage/exe/dmg, or `kiwix-serve`). On Android/iPhone: the Kiwix app.
- Open a `.zim` file with Kiwix. That's it.
- Command line: `kiwix-serve --port 8080 library/zim/*.zim` then open http://localhost:8080.

## If nothing reads the ZIM format any more (in ten years)
- The format is **open and documented**: spec in `library/git/openzim-spec` or wiki.openzim.org (Wikipedia "ZIM (file format)").
- The reader's source code is in `library/git/libzim.git`, `kiwix-tools.git`: any C++ programmer can rebuild it.
- Last resort: `zim-tools` (`zimdump`) turns a `.zim` into a folder of HTML pages any browser can read.

## For the AI
Install **Ollama** (`library/software/`), point `OLLAMA_MODELS` at `library/models/ollama`, then `ollama run qwen3:8b` (or whichever model is present, see `state.json`). Without Ollama: `llama.cpp` + the `.gguf` file in `library/models/`.

## Copying this disk for someone
Just copy the whole disk (`library/` + `arche/`). No installation. Redo it every 2–3 years onto a new disk: disks forgotten in a drawer lose their data.
