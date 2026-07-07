export interface Item { sku: string; price: number; discount?: number }
export function addItem(items: Item[], item: Item): Item[] {
  return [...items, item];
}
export function cartTotal(items: Item[]): number {
  return items.reduce((sum, i) => sum + i.price - (i.discount ?? 0), 0);
}
