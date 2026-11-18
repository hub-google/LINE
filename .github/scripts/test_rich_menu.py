"""Offline checks for Queue Monster's original two-tab 3-by-2 LINE OA menu."""
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
    def test_exactly_six_functional_buttons_in_each_original_3_by_2_menu(self):
        self.assertEqual([item[0] for item in richmenu.CUSTOMER_ITEMS],
                         ["搜尋店家", "我的進度", "常用店家", "歷史紀錄", "熱門店家", "問題回饋"])
        self.assertEqual([item[0] for item in richmenu.MERCHANT_ITEMS],
                         ["今日營運", "現場叫號", "預約管理", "訂單管理", "店家後台", "問題回饋"])
        self.assertEqual(len(richmenu.SPLITS_X), 4)
        self.assertEqual(len(richmenu.SPLITS_Y), 3)
        for items in (richmenu.CUSTOMER_ITEMS, richmenu.MERCHANT_ITEMS):
            self.assertEqual(len(items), 6)
            self.assertEqual(len(set(x[0] for x in items)), 6)
            for title, caption, glyph, action in items:
                self.assertTrue(title and caption and glyph)
                self.assertIn(action["type"], {"uri", "postback"})
                if action["type"] == "uri":
                    self.assertTrue(action["uri"].startswith(richmenu.BASE))
                    self.assertNotIn("#activate", action["uri"])
                else:
                    self.assertEqual(action["data"], "platform:feedback")

    def test_all_live_menu_urls_use_queue_domain_or_its_dedicated_line_liff(self):
        self.assertEqual(richmenu.BASE, "https://queue.monsterport.com/")
        liff_id = "1234567890-AbCdEf"
        customer_items = richmenu.customer_items_for_platform_liff(liff_id)
        for title, _, _, action in customer_items:
            if action["type"] == "uri":
                self.assertTrue(action["uri"].startswith("https://liff.line.me/" + liff_id + "/"), title)
                self.assertNotIn("github.io", action["uri"])
        for title, _, _, action in richmenu.MERCHANT_ITEMS:
            if action["type"] == "uri":
                self.assertTrue(action["uri"].startswith("https://queue.monsterport.com/"), title)
                self.assertNotIn("github.io", action["uri"])
        self.assertNotIn("hub-google.github.io", SOURCE.read_text(encoding="utf-8"))
        self.assertNotIn("github.io", richmenu.CUSTOMER_ITEMS[1][3]["uri"])

    def test_feedback_is_identical_for_customers_and_merchants(self):
        self.assertEqual(richmenu.CUSTOMER_ITEMS[-1][3],
                         richmenu.MERCHANT_ITEMS[-1][3])
        self.assertEqual(richmenu.CUSTOMER_ITEMS[-1][3]["displayText"], "問題回饋")
        self.assertNotIn("營運報表", [x[0] for x in richmenu.MERCHANT_ITEMS])
        self.assertFalse(any(x[0].startswith("切換") for items in (
            richmenu.CUSTOMER_ITEMS, richmenu.MERCHANT_ITEMS) for x in items))

    def test_customer_liff_entry_preserves_identity_and_feedback_action(self):
        items = richmenu.customer_items_for_platform_liff("1234567890-AbCdEf")
        self.assertEqual(len(items), 6)
        self.assertIn("/directory.html?mode=search&entry=platform-oa", items[0][3]["uri"])
        self.assertIn("site_return=my-records.html%3Fscope%3Dactive", items[1][3]["uri"])
        self.assertIn("site_return=directory.html%3Fmode%3Dfrequent%26entry%3Dplatform-oa", items[2][3]["uri"])
        self.assertIn("site_return=my-records.html%3Fscope%3Dhistory", items[3][3]["uri"])
        self.assertIn("directory.html?mode=search&entry=platform-oa", items[4][3]["uri"])
        self.assertEqual(items[5][3]["type"], "postback")
        with self.assertRaises(RuntimeError):
            richmenu.customer_items_for_platform_liff("")

    def test_rendered_images_keep_existing_dimensions_and_styling(self):
        pictures = [richmenu.create_image(richmenu.CUSTOMER_ITEMS, 0),
                    richmenu.create_image(richmenu.MERCHANT_ITEMS, 1)]
        self.assertNotEqual(pictures[0], pictures[1])
        for raw in pictures:
            self.assertLessEqual(len(raw), 1024 * 1024)
            with Image.open(io.BytesIO(raw)) as pic:
                self.assertEqual(pic.size, (2500, 1686))
                self.assertEqual(pic.format, "PNG")
        self.assertIn("#462B52", SOURCE.read_text(encoding="utf-8"))
        self.assertIn("#FFE8F2", SOURCE.read_text(encoding="utf-8"))
        self.assertIn("#FFF0CF", SOURCE.read_text(encoding="utf-8"))

    def test_tab_aliases_unchanged(self):
        self.assertEqual(richmenu.CUSTOMER_ALIAS, "platform-booking-customers")
        self.assertEqual(richmenu.MERCHANT_ALIAS, "platform-booking-merchants")
        self.assertLess(richmenu.TAB_HEIGHT, richmenu.HEIGHT // 2)


if __name__ == "__main__":
    unittest.main()
