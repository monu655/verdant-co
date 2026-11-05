-- Editable knowledge base. Seeded with the seven policies from the brief; agents can add, edit and delete entries.
CREATE TABLE knowledge_entries (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  topic      text NOT NULL,
  policy     text NOT NULL,
  position   int  NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO knowledge_entries (topic, policy, position) VALUES
  ('Shipping', 'Orders ship within 24 hours, Monday to Saturday. Delivery takes 3-5 business days in metro cities and 5-8 business days elsewhere in India.', 1),
  ('Address change', 'The delivery address can be changed only before the order has shipped, and only if the customer contacts us within 12 hours of placing it. After shipping, the address cannot be changed.', 2),
  ('Cancellation', 'An order can be cancelled before it ships. After it ships, the customer can refuse delivery and a refund is issued once the parcel returns to us.', 3),
  ('Returns', 'Returns are accepted within 7 days of delivery for unopened, unused products. Opened products are accepted only if damaged or if the wrong item was sent.', 4),
  ('Refunds', 'Approved refunds go back to the original payment method within 5-7 business days after we receive the returned parcel.', 5),
  ('Cash on delivery', 'Cash on delivery is available for orders under ₹3,000, with a ₹50 fee.', 6),
  ('Ingredients', 'All Verdant & Co products are fragrance-free and vegan.', 7);
