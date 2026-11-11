# Full registration entry for unbound LINE identities

The newcomer page still offered a separate name/phone-only binding application above the complete registration form. This allowed someone absent from the roster to submit an application that staff could not attach to a member. A pending binding application alone does not establish that the full form was completed.

Removed the separate application inputs and submit button. Unbound, pending, rejected and revoked states now show one explicit path to the complete member registration/update form. Pending wording distinguishes an application from completed registration and asks people with an already submitted review to contact staff rather than duplicate it. Revoked/rejected states retain the existing staff verification requirement. The staff review empty search message points applicants to the complete form rather than requiring staff to create a roster record first. Updated all affected module references and the service worker cache together.

No database, member data, role, auth or Edge Function changes. Existing verified phone/birthday claims, review for unverifiable existing members, completed member updates and public-feature dismissal behavior remain in place.

Validation: Chromium and WebKit at 393px/1440px exercised unbound-to-form, legacy pending-to-full-submission, no short binding request, login re-entry invitations, skip-once public access, approved profile flow, phone/birthday checks, staff-review submission and 401 recovery. An additional service_role fixture verifies that an existing pending application becomes approved when the full form completes, preserves its request row, creates one member/binding/care case and remains idempotent on retry. Seven existing database regression cases also passed. All fixture identities are synthetic; no member's LINE account was used. Physical phone acceptance remains pending.

Rollback: restore the six previous frontend files as a new commit. No data rollback is needed. Do not delete applications or create/approve a real member manually from the screenshot.
