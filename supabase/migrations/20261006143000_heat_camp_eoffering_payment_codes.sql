-- Match the official Siyuan eoffering import codes supplied on 2026-10-06.
-- Credit card = 1; ATM / virtual account = 3. The event default is credit card;
-- exports use each NewebPay order's actual payment method.
update camp_registration.events
set eoffering_payment_method=1,
    updated_at=now()
where slug='heat-basketball-camp-2027';
