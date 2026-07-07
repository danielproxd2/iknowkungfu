import { cartTotal, type Item } from "../cart";
export function charge(items: Item[]): { amount: number } {
  return { amount: cartTotal(items) };
}
