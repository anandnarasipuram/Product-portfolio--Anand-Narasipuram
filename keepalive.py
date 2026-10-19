import sys
from playwright.sync_api import sync_playwright

APP_URLS = [
    "https://heat-pump-copilot.streamlit.app",
    "https://delivery-lifecycle-diagnostics-copilot.streamlit.app",
]

WAKE_BUTTON = "button:has-text('get this app back up')"


def wake(page, url):
    page.goto(url, wait_until="domcontentloaded", timeout=60000)
    page.wait_for_timeout(5000)

    button = page.locator(WAKE_BUTTON)
    if button.count() > 0:
        print(f"{url}: asleep, clicking wake button")
        button.first.click()
        page.wait_for_timeout(45000)
    else:
        print(f"{url}: already awake")

    if page.locator(WAKE_BUTTON).count() > 0:
        print(f"{url}: STILL ASLEEP")
        return False
    return True


def main():
    ok = True
    with sync_playwright() as p:
        browser = p.chromium.launch()
        for url in APP_URLS:
            page = browser.new_page()
            try:
                ok = wake(page, url) and ok
            except Exception as e:
                print(f"{url}: error {e}")
                ok = False
            finally:
                page.close()
        browser.close()
    sys.exit(0 if ok else 1)


main()
