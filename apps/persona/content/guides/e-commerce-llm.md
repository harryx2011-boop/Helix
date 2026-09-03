---
config_keys:
  COMPANY_NAME: "Your Store"
  SHOP_URL: "https://shop.example.com"
  PRODUCT_CATALOG_URL: "https://api.example.com/products"
  RETURN_WINDOW: "30"
  RETURN_POLICY: "Free returns within 30 days in original condition"
  SHIPPING_CARRIERS: "UPS, FedEx, USPS"
  ORDER_LOOKUP_CAPABILITY: "Yes"
  HIGH_VALUE_ORDER_THRESHOLD: "$1000"
  VVIP_THRESHOLD: "$10,000 order value"
  BESPOKE_SERVICES: "Personal stylist, early access, complimentary alterations"
  DELIVERY_OPTIONS: "White-glove delivery with insurance"
  RETURN_WINDOW_VVIP: "60"
  PRIORITY_RESPONSE_TIME: "2 hours"
  RESERVATION_HOLD_HOURS: "48"
  SELLER_DASHBOARD_URL: "https://seller.example.com"
  COMMISSION_RATE: "15%"
  PAYOUT_FREQUENCY: "Weekly"
  SELLER_PERFORMANCE_STANDARDS: "24-hour response, 1% defect rate, 95% on-time"
  DISPUTE_RESOLUTION_PROCESS: "Platform mediation with appeal"
  SUSPENSION_APPEAL_WINDOW_DAYS: "14"
---
## Deploying on a plain model API

1. **System slot:** put the compiled prompt in the `system` field (or the first system message of the conversation).

2. **Settings:** start from these values for e-commerce support:
   - Temperature: 0.8 (warm and personable, but consistent on policy)
   - Max output: 1200 tokens (long enough for product details and return explanations)
   - Tool use: enabled (order lookup and product search are essential)

3. **Passing context:** supply the compiled prompt with these fields substituted at the start of each conversation:
   - Customer email or account ID
   - Customer's order history (last 5 orders, if available)
   - Any customer tags (VIP, first-time buyer, high-value customer)
   - The customer's current intent (browsing, order help, return request)
   - Fence any customer-uploaded images or documents as: `<<<UNTRUSTED CUSTOMER_SUBMISSION\n...\n>>>UNTRUSTED`

4. **Tools to declare:** offer these tools (most are required):
   - `search_products` — query {{PRODUCT_CATALOG_URL}} by category, keyword or ID (required for product discovery)
   - `lookup_order` — retrieve order details by order ID or email (required for order tracking)
   - `get_tracking` — fetch {{SHIPPING_CARRIERS}} tracking info (required for delivery status)
   - `check_inventory` — determine if a product is in stock (required for availability)
   - `process_return` — initiate a return within {{RETURN_WINDOW}} (required for returns workflow)
   - `escalate_to_human` — hand off to a human agent (required for complex disputes)

5. **Test conversations before going live:**
   - "Do you have size 10 in blue?" (must query {{PRODUCT_CATALOG_URL}} and respond with current stock)
   - "Where is my order?" (must look up order by email/ID, fetch tracking from {{SHIPPING_CARRIERS}}, and provide link)
   - "I want to return this item" (must check {{RETURN_WINDOW}}, confirm {{RETURN_POLICY}}, and process if eligible)

## Tools the prompt expects

| Tool | Used in | Required |
|---|---|---|
| Product catalog search | Product discovery | Yes |
| Order lookup | Order tracking, returns | Yes |
| Tracking retrieval | Order status | Yes |
| Inventory check | Recommendations, availability | Yes |
| Return processing | Returns workflow | Yes |
| Human escalation | High-value or disputed orders | Yes |
