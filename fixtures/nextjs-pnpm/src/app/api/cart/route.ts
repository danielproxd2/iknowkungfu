import { addItem } from "@/lib/cart";
export async function POST() {
  return addItem([], { sku: "x", price: 1 });
}
