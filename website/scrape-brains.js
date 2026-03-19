#!/usr/bin/env node
/**
 * Scrape brainletcoin.fun styling using Playwright
 * Extracts: fonts, colors, CSS, layout, animations
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

async function scrape() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  console.log('Navigating to brainletcoin.fun...');
  await page.goto('https://brainletcoin.fun', { waitUntil: 'networkidle' });

  // Take screenshot
  const screenshotBuffer = await page.screenshot({ fullPage: true });
  fs.writeFileSync('brainletcoin-screenshot.png', screenshotBuffer);
  console.log('Screenshot saved to brainletcoin-screenshot.png');

  // Extract computed styles for key elements
  const styles = await page.evaluate(() => {
    const result = {};

    // Get all stylesheets
    const sheets = document.styleSheets;
    const cssText = [];
    try {
      for (let sheet of sheets) {
        try {
          if (sheet.cssRules) {
            for (let rule of sheet.cssRules) {
              cssText.push(rule.cssText);
            }
          }
        } catch (e) {
          // CORS or other restrictions
        }
      }
    } catch (e) {}
    result.stylesheets = cssText;

    // Get body styles
    const bodyStyles = window.getComputedStyle(document.body);
    result.body = {
      backgroundColor: bodyStyles.backgroundColor,
      color: bodyStyles.color,
      fontFamily: bodyStyles.fontFamily,
      fontSize: bodyStyles.fontSize,
    };

    // Get H1 styles (main heading)
    const h1 = document.querySelector('h1');
    if (h1) {
      const h1Styles = window.getComputedStyle(h1);
      result.h1 = {
        fontFamily: h1Styles.fontFamily,
        fontSize: h1Styles.fontSize,
        fontWeight: h1Styles.fontWeight,
        textShadow: h1Styles.textShadow,
        color: h1Styles.color,
        textAlign: h1Styles.textAlign,
        letterSpacing: h1Styles.letterSpacing,
        textTransform: h1Styles.textTransform,
        margin: h1Styles.margin,
        padding: h1Styles.padding,
      };
    }

    // Get button styles
    const buttons = document.querySelectorAll('button, .btn, a.button');
    if (buttons.length > 0) {
      const btn = buttons[0];
      const btnStyles = window.getComputedStyle(btn);
      result.button = {
        backgroundColor: btnStyles.backgroundColor,
        color: btnStyles.color,
        fontFamily: btnStyles.fontFamily,
        fontWeight: btnStyles.fontWeight,
        fontSize: btnStyles.fontSize,
        padding: btnStyles.padding,
        border: btnStyles.border,
        boxShadow: btnStyles.boxShadow,
        borderRadius: btnStyles.borderRadius,
        textTransform: btnStyles.textTransform,
      };
    }

    // Get card/box styles
    const boxes = document.querySelectorAll('.card, .box, .container > div');
    if (boxes.length > 0) {
      const box = boxes[0];
      const boxStyles = window.getComputedStyle(box);
      result.box = {
        backgroundColor: boxStyles.backgroundColor,
        border: boxStyles.border,
        borderRadius: boxStyles.borderRadius,
        boxShadow: boxStyles.boxShadow,
        padding: boxStyles.padding,
        margin: boxStyles.margin,
      };
    }

    // Extract video background element if any
    const video = document.querySelector('video');
    if (video) {
      result.video = {
        src: video.src,
        autoplay: video.autoplay,
        muted: video.muted,
        loop: video.loop,
        position: window.getComputedStyle(video).position,
        objectFit: window.getComputedStyle(video).objectFit,
        width: video.clientWidth,
        height: video.clientHeight,
      };
    }

    // Get all keyframes from style tags
    const styleTags = document.querySelectorAll('style');
    const keyframes = [];
    for (let tag of styleTags) {
      const text = tag.textContent;
      if (text.includes('@keyframes')) {
        keyframes.push(text);
      }
    }
    result.keyframes = keyframes;

    return result;
  });

  fs.writeFileSync('brainletcoin-styles.json', JSON.stringify(styles, null, 2));
  console.log('Styles extracted to brainletcoin-styles.json');

  await browser.close();
}

scrape().catch(console.error);
