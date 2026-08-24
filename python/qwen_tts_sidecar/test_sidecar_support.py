import unittest

from sidecar_support import instruct_supported_for_model, resolve_speak_request


class SidecarSupportTests(unittest.TestCase):
    def test_instruct_supported_for_1_7b(self):
        self.assertTrue(instruct_supported_for_model("Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice"))

    def test_instruct_not_supported_for_0_6b(self):
        self.assertFalse(instruct_supported_for_model("Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice"))

    def test_resolve_applies_instruct_only_when_supported(self):
        applied = resolve_speak_request(
            {
                "text": "Hello there.",
                "speaker": "Vivian",
                "instruct": "warm audiobook narrator",
                "model": "Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice",
            }
        )
        self.assertEqual(applied["instruct"], "warm audiobook narrator")
        self.assertTrue(applied["instruct_applied"])

        ignored = resolve_speak_request(
            {
                "text": "Hello there.",
                "speaker": "Vivian",
                "instruct": "warm audiobook narrator",
                "model": "Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice",
            }
        )
        self.assertIsNone(ignored["instruct"])
        self.assertFalse(ignored["instruct_applied"])
        self.assertFalse(ignored["instruct_supported"])


if __name__ == "__main__":
    unittest.main()
