from app.eml import html_to_text


def test_html_to_text_paragraphs():
    text = html_to_text("<p>Hello</p><p>World <strong>now</strong></p>")
    assert text == "Hello\n\nWorld now"


def test_html_to_text_lists():
    text = html_to_text("<ul><li>one</li><li>two</li></ul>")
    assert "one" in text and "two" in text


def test_html_to_text_strips_scripts():
    text = html_to_text("<p>safe</p><script>alert(1)</script>")
    assert text == "safe"
