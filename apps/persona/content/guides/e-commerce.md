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
## Deploying on a storefront or chat widget

1. Fill the configuration keys above. The wizard on this page does it for you and substitutes them into the prompt.
2. Paste the compiled prompt into the system-instructions field of your e-commerce chat engine (Shopify, Gorgias, Zendesk, or a custom LLM).
3. Wire the data sources: give the model access to your product database ({{PRODUCT_CATALOG_URL}}), order management system (for {{ORDER_LOOKUP_CAPABILITY}}), and shipping carrier APIs (for {{SHIPPING_CARRIERS}} tracking).
4. Expose session context: the customer's email or account ID, their prior purchase history if available, and any tags (VIP, early buyer, high-value customer).
5. Test with three conversations before going live: a product question that requires catalog lookup, an order-status question, and a return request within {{RETURN_WINDOW}}. The third must process smoothly without escalation.

## Tools the prompt expects

| Tool | Used in | Required |
|---|---|---|
| Product catalog search | Product discovery, questions | Yes |
| Order lookup | Order tracking, returns | Yes |
| Shipping carrier tracking | Order status, delivery | Yes |
| Return/exchange processing | Returns workflow | Yes |
| Inventory check | Availability and recommendations | Yes |
