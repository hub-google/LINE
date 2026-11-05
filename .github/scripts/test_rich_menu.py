"""Offline contract tests for the LINE OA tabbed menu; no real token needed."""
import importlib.util
import io
import pathlib
import unittest
from PIL import Image

SOURCE = pathlib.Path(__file__).with_name("publish_rich_menu.py")
spec = importlib.util.spec_from_file_location("richmenu", SOURCE)
richmenu = importlib.util.module_from_spec(spec)
spec.loader.exec_module(richmenu)


class RichMenuContract(unittest.TestCase):
    def test_six_customer_and_merchant_buttons(self):
        self.assertEqual(len(richmenu.CUSTOMER_ITEMS), 6)
        self.assertEqual(len(richmenu.MERCHANT_ITEMS), 6)
        for items in (richmenu.CUSTOMER_ITEMS, richmenu.MERCHANT_ITEMS):
            for title, caption, glyph, action in items:
                self.assertTrue(title and caption and glyph)
                self.assertIn(action["type"], ("uri", "message"))
                if action["type"] == "uri":
                    self.assertTrue(action["uri"].startswith(richmenu.BASE))
                    self.assertNotIn("#activate", action["uri"])

    def test_customer_entry_points_and_no_test_shop(self):
        dest = [entry[3].get("uri", "") for entry in richmenu.CUSTOMER_ITEMS]
        self.assertTrue(any("mode=search" in d for d in dest))
        self.assertTrue(any("mode=queue" in d for d in dest))
        self.assertTrue(any("mode=mine" in d for d in dest))
        self.assertTrue(any("mode=game" in d for d in dest))
        self.assertFalse(any("greenfield" in d or "demo" in d for d in dest))

    def test_both_rendered_pngs(self):
        pictures = [richmenu.create_image(richmenu.CUSTOMER_ITEMS, 0),
                    richmenu.create_image(richmenu.MERCHANT_ITEMS, 1)]
        self.assertNotEqual(pictures[0], pictures[1])
        for raw in pictures:
            self.assertLessEqual(len(raw), 1024 * 1024)
            with Image.open(io.BytesIO(raw)) as pic:
                self.assertEqual(pic.size, (2500, 1686))
                self.assertEqual(pic.format, "PNG")

    def test_aliases_and_tab_geometry(self):
        self.assertNotEqual(richmenu.CUSTOMER_ALIAS, richmenu.MERCHANT_ALIAS)
        self.assertLessEqual(len(richmenu.CUSTOMER_ALIAS), 32)
        self.assertLessEqual(len(richmenu.MERCHANT_ALIAS), 32)
        self.assertGreater(richmenu.TAB_HEIGHT, 0)
        self.assertLess(richmenu.TAB_HEIGHT, richmenu.HEIGHT // 2)


if __name__ == "__main__":
    unittest.main()
