# Agent Instructions

- This repository is a collection of independent Ubuntu/Linux setup notes, dotfiles, and installers; there is no root package manifest, build system, CI workflow, or automated test suite.
- Treat each directory as a separate recipe and read its local `README.md` before changing or running it; the root `README.md` contains no additional workflow.
- Many recipes are version-specific and stale by design: for example, the CUDA 10.2 recipe targets Ubuntu 18.04, the NVIDIA driver recipe pins 510, and the TensorRT example pins old CUDA/TensorRT versions. Do not silently generalize or upgrade these commands without checking compatibility.
- Installation scripts can add APT repositories, require `sudo`, change files under `$HOME`, or alter system configuration. Inspect commands before execution and never run them as a test on the host.
- `OpenCV_Build/buildOpenCV.sh` removes `~/opencv_build` before rebuilding; preserve this warning and do not invoke it casually.
- Most tracked shell scripts are not executable (`0644`); run them explicitly with `bash path/to/script.sh` or make executability an intentional change. `open-in-warp-setup/install.sh` is the maintained exception and supports `./install.sh` or `./install.sh --extension`.
- The Open in Warp recipe is tested on Ubuntu 24.04/GNOME Nautilus 46.4; its extension path requires `python3-nautilus` and `sudo`, while the script-only path does not.
- There are no project test commands. For shell-only edits, use `bash -n path/to/changed-script.sh`; use `shellcheck` when available, and verify documentation commands against the target Ubuntu/software version.
- `.claude/` is ignored local Claude state; do not add or commit files from it. `GUI_ubuntu/Orchis-theme` is a tracked gitlink without a `.gitmodules` mapping, so do not assume it can be initialized through normal submodule commands.
