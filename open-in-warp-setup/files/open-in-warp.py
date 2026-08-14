import os
import subprocess
from urllib.parse import unquote, urlparse

from gi.repository import GObject, Nautilus


def _path_from_file(f):
    return unquote(urlparse(f.get_uri()).path)


class OpenInWarpExtension(GObject.GObject, Nautilus.MenuProvider):
    def _launch(self, menu, path):
        subprocess.Popen(
            ["warp-terminal", "warp://action/new_window?path=%s" % path],
            cwd=path,
            start_new_session=True,
        )

    def _item(self, name, path):
        item = Nautilus.MenuItem(name=name, label="Open in Warp", icon="dev.warp.Warp")
        item.connect("activate", self._launch, path)
        return item

    def get_file_items(self, *args):
        files = args[-1]
        if len(files) != 1:
            return []
        f = files[0]
        if f.get_uri_scheme() != "file":
            return []
        path = _path_from_file(f)
        if not f.is_directory():
            path = os.path.dirname(path)
        return [self._item("OpenInWarp::File", path)]

    def get_background_items(self, *args):
        folder = args[-1]
        if folder.get_uri_scheme() != "file":
            return []
        return [self._item("OpenInWarp::Bg", _path_from_file(folder))]
