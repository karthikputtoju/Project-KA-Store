'use strict';
// Daily-needs catalogue. Brands are fictional. Prices in INR.
// Variant tuple: [label, mrp, price, stock]

const CATEGORIES = [
  ['fruits-vegetables', 'Fruits & Vegetables', '🥦'],
  ['dairy-bakery', 'Dairy, Bread & Eggs', '🥛'],
  ['staples', 'Atta, Rice, Oil & Dals', '🌾'],
  ['snacks', 'Snacks & Packaged Food', '🍪'],
  ['beverages', 'Tea, Coffee & Beverages', '☕'],
  ['household', 'Cleaning & Household', '🧽'],
  ['personal-care', 'Personal Care', '🧴'],
  ['baby-care', 'Baby Care', '🍼'],
];

const PRODUCTS = [
  // ---- Fruits & vegetables
  ['Banana Robusta', 'FreshFarm', 'fruits-vegetables', '🍌', 'Naturally ripened, rich in potassium. Perfect for breakfast and smoothies.', [['6 pcs', 60, 48, 80], ['12 pcs', 115, 89, 40]], 'fruit,fresh'],
  ['Apple Shimla', 'FreshFarm', 'fruits-vegetables', '🍎', 'Crisp and juicy apples from the hills of Himachal.', [['500 g', 120, 99, 50], ['1 kg', 230, 185, 30]], 'fruit,fresh'],
  ['Tomato Hybrid', 'FreshFarm', 'fruits-vegetables', '🍅', 'Firm, red hybrid tomatoes for curries and salads.', [['500 g', 30, 24, 120], ['1 kg', 58, 45, 90]], 'vegetable,fresh'],
  ['Onion', 'FreshFarm', 'fruits-vegetables', '🧅', 'Medium-sized onions, the base of every Indian kitchen.', [['1 kg', 50, 39, 150], ['2 kg', 98, 75, 70]], 'vegetable,fresh'],
  ['Potato', 'FreshFarm', 'fruits-vegetables', '🥔', 'Versatile potatoes for fries, curries and parathas.', [['1 kg', 40, 32, 140], ['2 kg', 78, 60, 60]], 'vegetable,fresh'],
  ['Carrot Ooty', 'FreshFarm', 'fruits-vegetables', '🥕', 'Sweet, crunchy Ooty carrots.', [['500 g', 45, 36, 60]], 'vegetable,fresh'],
  ['Spinach (Palak)', 'GreenLeaf', 'fruits-vegetables', '🥬', 'Fresh leafy palak, cleaned and bundled.', [['250 g', 25, 20, 45]], 'vegetable,leafy'],
  ['Alphonso Mango', 'FreshFarm', 'fruits-vegetables', '🥭', 'The king of mangoes. Seasonal — currently out of stock.', [['1 kg', 499, 449, 0]], 'fruit,seasonal'],
  ['Lemon', 'GreenLeaf', 'fruits-vegetables', '🍋', 'Juicy lemons, great for nimbu pani.', [['250 g', 35, 28, 70]], 'vegetable,citrus'],
  ['Green Chilli', 'GreenLeaf', 'fruits-vegetables', '🌶️', 'Spicy green chillies.', [['100 g', 15, 12, 90]], 'vegetable'],
  ['Green Grapes', 'FreshFarm', 'fruits-vegetables', '🍇', 'Seedless, sweet green grapes.', [['500 g', 99, 79, 8]], 'fruit,fresh'],
  ['Cucumber', 'GreenLeaf', 'fruits-vegetables', '🥒', 'Cool, crunchy cucumbers for salads.', [['500 g', 30, 25, 65]], 'vegetable,salad'],

  // ---- Dairy, bread & eggs
  ['Toned Milk', 'DailyDairy', 'dairy-bakery', '🥛', 'Pasteurised toned milk, 3% fat.', [['500 ml', 28, 27, 200], ['1 L', 56, 54, 150]], 'milk,daily'],
  ['Fresh Curd', 'DailyDairy', 'dairy-bakery', '🍶', 'Thick and creamy set curd.', [['400 g', 45, 40, 80]], 'curd,daily'],
  ['Malai Paneer', 'DailyDairy', 'dairy-bakery', '🧀', 'Soft fresh paneer for tikka and curries.', [['200 g', 95, 85, 40]], 'paneer'],
  ['Salted Butter', 'DailyDairy', 'dairy-bakery', '🧈', 'Creamy salted table butter.', [['100 g', 58, 56, 90], ['500 g', 285, 270, 25]], 'butter'],
  ['Cheese Slices', 'DailyDairy', 'dairy-bakery', '🧀', 'Processed cheese slices, 10 slices.', [['200 g', 150, 135, 35]], 'cheese'],
  ['Brown Bread', 'OvenFresh', 'dairy-bakery', '🍞', 'High-fibre whole wheat brown bread.', [['400 g', 50, 45, 60]], 'bread,daily'],
  ['Farm Eggs', 'HappyHen', 'dairy-bakery', '🥚', 'Fresh white eggs from free-range farms.', [['6 pcs', 54, 48, 100], ['12 pcs', 105, 92, 60], ['30 pcs', 255, 225, 20]], 'eggs,protein', 0],
  ['Butter Croissant', 'OvenFresh', 'dairy-bakery', '🥐', 'Flaky, buttery croissants baked daily.', [['Pack of 2', 90, 80, 15]], 'bakery'],

  // ---- Staples
  ['Whole Wheat Atta', 'GoldenGrain', 'staples', '🌾', '100% whole wheat chakki atta for soft rotis.', [['5 kg', 285, 249, 70], ['10 kg', 560, 479, 30]], 'atta,flour'],
  ['Basmati Rice', 'GoldenGrain', 'staples', '🍚', 'Long-grain aged basmati rice.', [['1 kg', 160, 139, 80], ['5 kg', 790, 649, 25]], 'rice'],
  ['Toor Dal', 'GoldenGrain', 'staples', '🫘', 'Unpolished arhar / toor dal.', [['1 kg', 199, 175, 60]], 'dal,pulses'],
  ['Sugar', 'SweetCrystal', 'staples', '🧂', 'Refined white sugar.', [['1 kg', 55, 48, 120]], 'sugar'],
  ['Iodised Salt', 'PureSea', 'staples', '🧂', 'Free-flowing iodised salt.', [['1 kg', 28, 25, 150]], 'salt'],
  ['Sunflower Oil', 'GoldenDrop', 'staples', '🛢️', 'Refined sunflower oil, light and healthy.', [['1 L', 175, 155, 90], ['5 L', 850, 735, 20]], 'oil'],
  ['Cow Ghee', 'DailyDairy', 'staples', '🫙', 'Pure cow ghee with rich aroma.', [['500 ml', 330, 315, 40], ['1 L', 650, 610, 15]], 'ghee'],
  ['Turmeric Powder', 'SpiceRoute', 'staples', '🟡', 'Pure haldi powder.', [['200 g', 60, 52, 70]], 'spices'],

  // ---- Snacks
  ['Classic Salted Chips', 'Crunchy', 'snacks', '🍟', 'Thin, crispy salted potato chips.', [['52 g', 20, 20, 200], ['Party pack 200 g', 80, 70, 50]], 'chips'],
  ['Choco Chip Cookies', 'Crunchy', 'snacks', '🍪', 'Buttery cookies loaded with chocolate chips.', [['150 g', 60, 50, 90]], 'biscuits'],
  ['Aloo Bhujia', 'NamkeenHouse', 'snacks', '🥨', 'Spicy, crunchy aloo bhujia.', [['400 g', 110, 95, 75]], 'namkeen'],
  ['Dark Chocolate 70%', 'CocoaCraft', 'snacks', '🍫', 'Rich 70% cocoa dark chocolate.', [['100 g', 175, 155, 40]], 'chocolate'],
  ['Masala Instant Noodles', 'QuickBite', 'snacks', '🍜', 'Ready in 2 minutes.', [['Pack of 4', 60, 56, 180], ['Pack of 12', 180, 159, 45]], 'noodles'],
  ['Butter Popcorn', 'QuickBite', 'snacks', '🍿', 'Microwave butter popcorn.', [['90 g', 50, 45, 55]], 'popcorn'],

  // ---- Beverages
  ['Assam Tea', 'ChaiTime', 'beverages', '🍵', 'Strong Assam CTC tea.', [['250 g', 140, 125, 90], ['500 g', 275, 235, 40]], 'tea'],
  ['Instant Coffee', 'BrewMaster', 'beverages', '☕', '100% pure instant coffee.', [['100 g', 320, 289, 50]], 'coffee'],
  ['Orange Juice', 'SipCo', 'beverages', '🧃', 'No added sugar orange juice.', [['1 L', 130, 115, 45]], 'juice'],
  ['Cola Soft Drink', 'FizzUp', 'beverages', '🥤', 'Chilled cola.', [['750 ml', 45, 40, 120], ['2 L', 99, 90, 50]], 'soft-drink'],
  ['Mineral Water', 'PureSip', 'beverages', '💧', 'Packaged drinking water.', [['1 L', 20, 20, 300], ['Pack of 12 x 1 L', 240, 199, 30]], 'water'],
  ['Tender Coconut Water', 'SipCo', 'beverages', '🥥', 'Natural electrolytes.', [['200 ml', 45, 40, 6]], 'coconut'],

  // ---- Household
  ['Detergent Powder', 'CleanHome', 'household', '🧺', 'Removes tough stains in one wash.', [['1 kg', 140, 125, 70], ['4 kg', 520, 449, 25]], 'laundry'],
  ['Dishwash Liquid', 'CleanHome', 'household', '🍽️', 'Lemon-power dishwash gel.', [['500 ml', 115, 99, 60]], 'kitchen'],
  ['Floor Cleaner', 'CleanHome', 'household', '🧴', 'Kills 99.9% germs. Floral fragrance.', [['1 L', 199, 175, 45]], 'cleaning'],
  ['Toilet Cleaner', 'CleanHome', 'household', '🚽', 'Thick liquid toilet cleaner.', [['500 ml', 99, 89, 50]], 'cleaning'],
  ['Garbage Bags (Medium)', 'EcoWrap', 'household', '🗑️', 'Biodegradable garbage bags, 30 pcs.', [['30 pcs', 120, 99, 80]], 'bags'],
  ['Toilet Tissue Rolls', 'SoftTouch', 'household', '🧻', '2-ply soft tissue rolls.', [['Pack of 4', 160, 140, 65]], 'tissue'],

  // ---- Personal care
  ['Fresh Mint Toothpaste', 'CareWell', 'personal-care', '🪥', 'Cavity protection with fresh mint.', [['150 g', 110, 95, 100]], 'oral-care'],
  ['Anti-Dandruff Shampoo', 'CareWell', 'personal-care', '🧴', 'Clinically proven anti-dandruff shampoo.', [['180 ml', 199, 175, 60], ['340 ml', 360, 310, 30]], 'hair-care'],
  ['Neem Bath Soap', 'CareWell', 'personal-care', '🧼', 'Neem & tulsi bath soap, pack of 4.', [['4 x 100 g', 160, 135, 80]], 'bath'],
  ['Hand Wash Refill', 'CareWell', 'personal-care', '🧴', 'Germ-protection hand wash refill.', [['750 ml', 149, 125, 55]], 'hygiene'],
  ['Aloe Face Wash', 'GlowUp', 'personal-care', '🫧', 'Gentle aloe vera face wash.', [['100 ml', 175, 150, 40]], 'skin-care'],

  // ---- Baby care
  ['Baby Diaper Pants', 'TinyTots', 'baby-care', '👶', 'Ultra-soft diaper pants with 12-hour absorption.', [['Size M (42 pcs)', 799, 649, 30], ['Size L (36 pcs)', 799, 649, 25], ['Size XL (32 pcs)', 849, 699, 3]], 'diapers'],
  ['Baby Wipes', 'TinyTots', 'baby-care', '🧻', 'Alcohol-free gentle wipes, 72 pcs.', [['72 pcs', 199, 169, 50]], 'wipes'],
  ['Baby Cereal (Rice)', 'TinyTots', 'baby-care', '🥣', 'Iron-fortified rice cereal for 6+ months.', [['300 g', 260, 240, 35]], 'baby-food'],
  ['Baby Lotion', 'TinyTots', 'baby-care', '🍼', 'Mild moisturising lotion.', [['200 ml', 230, 199, 40]], 'baby-skin'],
];

// [code, type, value, minOrder, maxDiscount, expiresDays(+/-), perUserLimit, description, category, firstOrderOnly]
const COUPONS = [
  ['WELCOME50', 'flat', 50, 199, null, 365, 1, '₹50 off your first order above ₹199', null, true],
  ['SAVE10', 'percent', 10, 299, 100, 365, null, '10% off up to ₹100 on orders above ₹299', null],
  ['FRESH20', 'percent', 20, 0, 150, 365, null, '20% off Fruits & Vegetables (max ₹150)', 'fruits-vegetables'],
  ['FREEDEL', 'free_delivery', 0, 0, null, 365, null, 'Free delivery on any order', null],
  ['EXPIRED25', 'percent', 25, 0, null, -10, null, 'Expired coupon (for negative testing)', null],
];

module.exports = { CATEGORIES, PRODUCTS, COUPONS };
