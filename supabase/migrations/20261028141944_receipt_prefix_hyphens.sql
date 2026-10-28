begin;
-- Accept half-width and common typographic hyphens used by mobile keyboards.
-- Retain the existing 12-character limit and all issued-receipt prefix locks.
alter table finance.receipt_issuer
 drop constraint receipt_issuer_money_prefix_check,
 drop constraint receipt_issuer_goods_prefix_check,
 add constraint receipt_issuer_money_prefix_check check(money_prefix ~ '^[A-Za-z0-9一-龥‐‑–—－-]{1,12}$'),
 add constraint receipt_issuer_goods_prefix_check check(goods_prefix ~ '^[A-Za-z0-9一-龥‐‑–—－-]{1,12}$');
commit;
