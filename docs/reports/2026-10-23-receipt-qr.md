# Receipt QR optimization

Local, bounded worker scans Taiwan invoice QR codes before Gemini. Invoice number and TWD total are retained as suggestions; existing fields are preserved. Complete UTF-8 left-code items avoid cloud recognition. Partial, Big5, Base64 and right-code continuation items use existing image recognition; no unsupported item decoding is guessed. Overseas currency is not filled as TWD. Distinct invoice codes are not combined. All suggestions require human review; QR is not authenticity verification.

Pinned jsQR 1.4.0 npm integrity verified; MIT license retained. Official format: https://www.einvoice.nat.gov.tw/static/ptl/ein_upload/attachments/1575448081679_0.pdf

Validation: 9 QR/OCR unit tests; existing Chrome 390/1440 OCR flow 30 checks; service worker 23 checks. Synthetic actual QR pixels decoded correctly (13 ms Node single fixture; not mobile timing claim). Actual iPhone/Safari camera not verified.
