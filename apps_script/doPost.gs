/**
 * Apps Script Web App handler for AED suggestions.
 * - Verifies reCAPTCHA (v3)
 * - Appends a row to the configured Google Sheet
 * - Optionally saves an uploaded photo (data URL) to Drive
 * - Sends an email notification
 *
 * Configuration (set via Script Properties):
 * - RECAPTCHA_SECRET  : your reCAPTCHA secret key
 * - SHEET_ID          : the Google Sheet ID to append rows to
 * - RECIPIENT_EMAIL   : (optional) email address to receive notifications
 */

function doPost(e) {
  const respond = (obj) => ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);

  try {
    // Parse incoming payload (supports JSON and application/x-www-form-urlencoded)
    let params = {};
    if (e.postData && e.postData.type && e.postData.type.indexOf('application/json') !== -1) {
      params = JSON.parse(e.postData.contents || '{}');
    } else {
      params = e.parameter || {};
    }

    const token = params.recaptchaToken || params.recaptcha || '';

    const props = PropertiesService.getScriptProperties();
    const SECRET = props.getProperty('RECAPTCHA_SECRET');
    const SHEET_ID = props.getProperty('SHEET_ID');
    const RECIPIENT = props.getProperty('RECIPIENT_EMAIL') || '';

    if (!SECRET) return respond({ ok:false, error:'RECAPTCHA_SECRET not set' });
    if (!SHEET_ID) return respond({ ok:false, error:'SHEET_ID not set' });

    // Verify reCAPTCHA
    const verify = UrlFetchApp.fetch('https://www.google.com/recaptcha/api/siteverify', {
      method: 'post',
      payload: { secret: SECRET, response: token },
      muteHttpExceptions: true
    });
    const v = JSON.parse(verify.getContentText());
    if (!v.success || (v.score && v.score < 0.3)) {
      return respond({ ok:false, error:'recaptcha_failed', recaptcha: v });
    }

    // Extract fields
    const name = params.name || '';
    const email = params.email || '';
    const location = params.location || '';
    const notes = params.notes || '';
    const photoData = params.photoData || null;

    // Open sheet and append
    const ss = SpreadsheetApp.openById(SHEET_ID);
    const sh = ss.getSheets()[0];
    const now = new Date();
    let photoUrl = '';

    // Save photo if provided as data URL
    if (photoData && String(photoData).indexOf('data:') === 0) {
      const m = String(photoData).match(/^data:(image\/[^;]+);base64,(.+)$/);
      if (m) {
        const contentType = m[1];
        const b64 = m[2];
        const blob = Utilities.newBlob(Utilities.base64Decode(b64), contentType, 'suggestion-' + Date.now());
        const file = DriveApp.createFile(blob);
        photoUrl = file.getUrl();
      }
    }

    sh.appendRow([ now, name, email, location, notes, photoUrl, JSON.stringify(v) ]);

    // Send email notification if configured
    if (RECIPIENT) {
      const subject = `AED suggestion: ${location || name || 'new suggestion'}`;
      const body = `Name: ${name}\nEmail: ${email}\nLocation: ${location}\nNotes: ${notes}\nPhoto: ${photoUrl}\nSheet: ${ss.getUrl()}`;
      MailApp.sendEmail(RECIPIENT, subject, body);
    }

    return respond({ ok:true, appended:true, photoUrl, recaptcha: v });
  }
  catch (err) {
    return respond({ ok:false, error: String(err), stack: err.stack ? err.stack : null });
  }
}
