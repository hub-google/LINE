import importlib.util
import unittest
from pathlib import Path
from unittest.mock import patch

SCRIPT=Path(__file__).with_name("publish_workforce_rich_menu.py")
spec=importlib.util.spec_from_file_location("workforce_rich_menu",SCRIPT)
module=importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class WorkforceMenuTests(unittest.TestCase):
    def test_all_six_buttons_map_to_developing_mini_and_correct_pixel_areas(self):
        data=module.menu_body("developing")
        self.assertEqual(data["size"],{"width":2500,"height":1686})
        self.assertEqual(len(data["areas"]),6)
        expected=["punch","schedule","requests","inbox","overview","approvals"]
        for a,tab in zip(data["areas"],expected):
            self.assertTrue(a["action"]["uri"].startswith(
                "https://miniapp.line.me/2012649404-nz3TBQdG?tab="))
            self.assertEqual(a["action"]["uri"].split("tab=")[1],tab)
        self.assertEqual(sum(a["bounds"]["width"] for a in data["areas"][:3]),2500)
        self.assertEqual(sum(a["bounds"]["height"] for a in (data["areas"][0],data["areas"][3])),1686)

    def test_published_is_not_interchanged_with_developing(self):
        dev=module.menu_body("developing")
        published=module.menu_body("published")
        self.assertNotEqual(dev["areas"][0]["action"]["uri"],published["areas"][0]["action"]["uri"])
        for a in published["areas"]:
            self.assertIn("2012649406-KzlLEZT6",a["action"]["uri"])

    def test_review_and_unknown_environments_cannot_be_default(self):
        for name in ("review","unknown",""):
            with self.assertRaises(ValueError):
                module.menu_body(name)

    def test_wrong_oa_channel_refuses_operation_even_when_token_is_supplied(self):
        with self.assertRaisesRegex(RuntimeError,"Invalid WF_LINE_MESSAGING_CHANNEL_ID secret"):
            module.publish("developing","not-a-real-token-123456789012345678901","bad")

    def test_line_credentials_are_never_logged_on_invalid_token(self):
        with self.assertRaisesRegex(RuntimeError,"Missing WF_LINE_MESSAGING_ACCESS_TOKEN"):
            module.publish("developing","","2012650797")

    def test_no_menu_is_published_when_validation_fails(self):
        with patch.object(module,"validate_token",side_effect=RuntimeError("Wrong token")):
            with patch.object(module,"call") as api:
                with self.assertRaises(RuntimeError):
                    module.publish("published","x"*50,"2012650797")
                api.assert_not_called()

    def test_png_meets_line_image_requirements(self):
        payload=module.generate_image()
        self.assertTrue(payload.startswith(b"\x89PNG\r\n\x1a\n"))
        self.assertLess(len(payload),1000000)


if __name__=="__main__":
    unittest.main()
