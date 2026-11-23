"""
Selenium 4 + pytest example.
Setup:  pip install selenium pytest
Run:    (store running on :3000)  pytest examples/selenium-python -v
Selenium Manager downloads the right ChromeDriver automatically.
"""
import os
import pytest
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

BASE = os.environ.get("BASE_URL", "http://localhost:3000")


def tid(value):
    return (By.CSS_SELECTOR, f'[data-testid="{value}"]')


@pytest.fixture
def driver():
    opts = webdriver.ChromeOptions()
    if os.environ.get("HEADLESS", "1") == "1":
        opts.add_argument("--headless=new")
    opts.add_argument("--window-size=1400,900")
    d = webdriver.Chrome(options=opts)
    yield d
    d.quit()


def test_login_and_add_to_cart(driver):
    wait = WebDriverWait(driver, 10)
    driver.get(f"{BASE}/#/login")
    wait.until(EC.visibility_of_element_located(tid("input-email"))).send_keys("demo@karthikautomation.test")
    driver.find_element(*tid("input-password")).send_keys("Passw0rd!")
    driver.find_element(*tid("login-submit")).click()
    assert wait.until(EC.visibility_of_element_located(tid("user-name"))).text == "Demo"

    driver.get(f"{BASE}/#/product/1")
    wait.until(EC.element_to_be_clickable(tid("pdp-add-to-cart"))).click()
    wait.until(EC.visibility_of_element_located(tid("qty-stepper")))
    assert int(driver.find_element(*tid("cart-count")).text) >= 1


def test_shadow_dom_with_selenium(driver):
    wait = WebDriverWait(driver, 10)
    driver.get(f"{BASE}/#/practice/shadow-dom")
    host = wait.until(EC.presence_of_element_located(tid("shadow-host")))
    root = host.shadow_root
    root.find_element(By.CSS_SELECTOR, '[data-testid="shadow-input"]').send_keys("SAVE10")
    root.find_element(By.CSS_SELECTOR, '[data-testid="shadow-button"]').click()
    assert "accepted" in root.find_element(By.CSS_SELECTOR, '[data-testid="shadow-message"]').text


def test_iframe_with_selenium(driver):
    wait = WebDriverWait(driver, 10)
    driver.get(f"{BASE}/#/practice/frames")
    wait.until(EC.frame_to_be_available_and_switch_to_it((By.ID, "frame-one")))
    driver.find_element(*tid("frame-name")).send_keys("Selenium")
    driver.find_element(*tid("frame-submit")).click()
    driver.switch_to.default_content()
    assert "Selenium" in wait.until(EC.visibility_of_element_located(tid("frame-message"))).text
