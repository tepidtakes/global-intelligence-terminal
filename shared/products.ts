// Traded products by Harmonized System (HS) code, used for "who exports / imports what".
// Values come live from UN Comtrade; this list only names the codes and links them to
// commodity profiles where one exists.

export interface Product { hs: string; label: string; group: ProductGroup; commodity?: string; }
export type ProductGroup = 'Energy' | 'Metals & minerals' | 'Agriculture & food' | 'Manufactured goods' | 'Chemicals & materials';

export const PRODUCTS: Product[] = [
  { hs: '2709', label: 'Crude oil', group: 'Energy', commodity: 'commodity:crude-oil' },
  { hs: '2710', label: 'Refined petroleum products', group: 'Energy' },
  { hs: '2711', label: 'Natural gas & LNG', group: 'Energy', commodity: 'commodity:natural-gas' },
  { hs: '2701', label: 'Coal', group: 'Energy', commodity: 'commodity:coal' },
  { hs: '2612', label: 'Uranium & thorium ores', group: 'Energy', commodity: 'commodity:uranium' },
  { hs: '7108', label: 'Gold', group: 'Metals & minerals', commodity: 'commodity:gold' },
  { hs: '7106', label: 'Silver', group: 'Metals & minerals', commodity: 'commodity:silver' },
  { hs: '7110', label: 'Platinum & palladium', group: 'Metals & minerals', commodity: 'commodity:platinum' },
  { hs: '2603', label: 'Copper ores', group: 'Metals & minerals' },
  { hs: '7403', label: 'Refined copper', group: 'Metals & minerals', commodity: 'commodity:copper' },
  { hs: '2601', label: 'Iron ore', group: 'Metals & minerals', commodity: 'commodity:iron-ore' },
  { hs: '72', label: 'Iron & steel', group: 'Metals & minerals' },
  { hs: '7601', label: 'Aluminium (unwrought)', group: 'Metals & minerals', commodity: 'commodity:aluminium' },
  { hs: '7502', label: 'Nickel (unwrought)', group: 'Metals & minerals', commodity: 'commodity:nickel' },
  { hs: '8105', label: 'Cobalt', group: 'Metals & minerals', commodity: 'commodity:cobalt' },
  { hs: '283691', label: 'Lithium carbonate', group: 'Metals & minerals', commodity: 'commodity:lithium' },
  { hs: '2846', label: 'Rare-earth compounds', group: 'Metals & minerals', commodity: 'commodity:rare-earths' },
  { hs: '7102', label: 'Diamonds', group: 'Metals & minerals' },
  { hs: '1001', label: 'Wheat', group: 'Agriculture & food', commodity: 'commodity:wheat' },
  { hs: '1005', label: 'Corn (maize)', group: 'Agriculture & food', commodity: 'commodity:corn' },
  { hs: '1006', label: 'Rice', group: 'Agriculture & food', commodity: 'commodity:rice' },
  { hs: '1201', label: 'Soybeans', group: 'Agriculture & food', commodity: 'commodity:soybeans' },
  { hs: '1507', label: 'Soybean oil', group: 'Agriculture & food' },
  { hs: '1511', label: 'Palm oil', group: 'Agriculture & food' },
  { hs: '0901', label: 'Coffee', group: 'Agriculture & food', commodity: 'commodity:coffee' },
  { hs: '1801', label: 'Cocoa beans', group: 'Agriculture & food', commodity: 'commodity:cocoa' },
  { hs: '1701', label: 'Sugar', group: 'Agriculture & food', commodity: 'commodity:sugar' },
  { hs: '5201', label: 'Raw cotton', group: 'Agriculture & food', commodity: 'commodity:cotton' },
  { hs: '0201', label: 'Beef (fresh or chilled)', group: 'Agriculture & food', commodity: 'commodity:cattle' },
  { hs: '0203', label: 'Pork', group: 'Agriculture & food', commodity: 'commodity:lean-hogs' },
  { hs: '0207', label: 'Poultry meat', group: 'Agriculture & food' },
  { hs: '03', label: 'Fish & seafood', group: 'Agriculture & food' },
  { hs: '2204', label: 'Wine', group: 'Agriculture & food' },
  { hs: '31', label: 'Fertilizers', group: 'Chemicals & materials' },
  { hs: '3004', label: 'Medicines (packaged)', group: 'Chemicals & materials' },
  { hs: '39', label: 'Plastics', group: 'Chemicals & materials' },
  { hs: '44', label: 'Wood & lumber', group: 'Chemicals & materials', commodity: 'commodity:lumber' },
  { hs: '8542', label: 'Integrated circuits (chips)', group: 'Manufactured goods', commodity: 'commodity:semiconductors' },
  { hs: '8471', label: 'Computers', group: 'Manufactured goods' },
  { hs: '8517', label: 'Phones & telecom equipment', group: 'Manufactured goods' },
  { hs: '8541', label: 'Solar cells, LEDs & diodes', group: 'Manufactured goods' },
  { hs: '8507', label: 'Batteries (incl. lithium-ion)', group: 'Manufactured goods' },
  { hs: '8703', label: 'Passenger cars', group: 'Manufactured goods', commodity: 'commodity:automobiles' },
  { hs: '8708', label: 'Vehicle parts', group: 'Manufactured goods' },
  { hs: '8802', label: 'Aircraft', group: 'Manufactured goods' },
  { hs: '8486', label: 'Chip-making equipment', group: 'Manufactured goods' },
  { hs: '93', label: 'Arms & ammunition', group: 'Manufactured goods' },
  { hs: '61', label: 'Apparel (knitted)', group: 'Manufactured goods' },
];

export const productByHs = (hs: string) => PRODUCTS.find((p) => p.hs === hs);
