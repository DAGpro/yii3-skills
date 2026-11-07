The checkout form (POST /checkout) currently demands a coupon code from every customer, but most orders have no coupon at all.

The coupon code shouldn't be mandatory for everyone: make it required only when the customer ticks 'I have a coupon' (the hasCoupon boolean field), optional otherwise. Use the validator's conditional-rule mechanism on the form model, not if-branches in the action.
