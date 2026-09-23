// Transcribed from the two Kathy's Diners / Kathy's Cafe menu photos.
// One product per section; sizes and portions are variants, not duplicate products.
const items = [];
const slug = value => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
function add(category, section, name, prices, labels = ['Regular'], description = '') {
  const variants = (Array.isArray(prices) ? prices : [prices])
    .flatMap((price, index) => price === null ? [] : [{ label: labels[index], price }]);
  items.push({ source_key: slug(section + '-' + name), name, category, section, description,
    price: Math.min(...variants.map(option => option.price)), variants, available: true });
}
function group(category, section, names, prices, label = 'Regular') {
  names.forEach((name, i) => add(category, section, name, Array.isArray(prices) ? prices[i] : prices, [label]));
}
group('bites', "Fire Fighter's Meal", ['Classic Beef Tapa','Tocino','Longganisa','Boneless Bangus','Hungarian Sausage','Chicken Sausage','Corned Beef','Luncheon Meat','Sisig'], 198);
group('bites', 'Meal Add-ons', ['Extra Egg','Extra Rice','Convert Rice to Waffle','With Soda'], [25,45,50,80], 'Add-on');
group('bites', 'Pizza Thin Crust', ['Truffle','Meaty','Pepperoni','Hawaiian','Spanish Sardines','Vegetable'], [318,318,298,298,298,298]);
group('bites', 'Croissant', ['Classic','Ham and Cheese','Tuna Mayo','Egg and Cheese'], [100,159,159,159]);
group('bites', 'Pasta', ['Truffle','Pesto','Spanish Sardines','Carbonara','Red Sauce'], [268,258,238,198,198]);
['Classic','Strawberry','Blueberry','Mango','Cookies and Cream','Biscoff','Nutella'].forEach((name, i) =>
  add('sweet', 'Burnt Basque Cheesecake', name, i === 0 ? [145,1088] : i < 5 ? [155,1188] : [175,1388], ['Slice','Whole']));
group('sweet', 'Desserts', ['Muffins','Brownies Slice','Chocolate Chip Walnut','Chocolate Chip Oat','Biscoff Cookie','Cookies and Cream','Double Chocolate Chip'], 99);
group('bites', 'Empanada', ['Ham and Cheese','Tuna and Cheese'], 145);
add('bites', 'Barkada Snacks', 'Fries', [138,265,375], ['Pumper · Small','Engine · Medium','Tanker · Large'], 'New York or wedge fries. Flavors: cheese, BBQ, sour cream.');
add('bites', 'Barkada Snacks', 'Onion Rings', [200,350], ['Engine · Medium','Tanker · Large']);
group('sweet', 'Classic Waffles', ['Plain','Biscoff','Nutella'], 120);
group('sweet', 'Premium Waffles', ['Nutella Alcapone','Biscoff Alcapone','Biscoff Overload','Cookies and Cream','Strawberry Cream','Mango Float'], 160);
const drinkSizes = ['Hot · 8 oz','Hot · 12 oz','Cold · 16 oz'];
const coffees = [
  ['Cafe Americano',100,125,135], ['Latte Machiatto',120,125,135], ['Cappucino',120,125,null],
  ['Mochacinno',120,125,135], ['French Vanilla Latte',120,125,135], ['Hazelnut Latte',120,125,135],
  ['Salted Caramel Latte',120,125,135], ['Cinnamon Latte',120,125,135], ['Roasted Almond Latte',120,125,135],
  ['Spanish Latte',120,125,135], ['Ube Latte',120,125,135], ['Biscoff Latte',null,165,185],
  ['Toffenut Latte',null,165,185], ['Espresso Sunrise',null,165,185], ['Dirty Matcha Latte',160,165,185]
];
coffees.forEach(([name,...prices]) => add('coffee','Coffee',name,prices,drinkSizes));
const nonCoffee = [
  ['Chocolate',120,125,135], ['Milk Tea',120,125,135], ['Matcha Latte',120,135,145],
  ['Matcha Hazelnut Latte',120,135,145], ['Strawberry Matcha',120,135,145], ['Dark Chocolate Matcha',160,165,185],
  ['Lemon and Ginger Tea',null,125,135], ['Milk Strawberry Latte',null,null,135], ['Milk Coconut',null,null,135],
  ['Red Velvet Tea',null,null,135], ['Green Apple Fruit Tea',null,null,135], ['Watermelon Fruit Tea',null,null,135],
  ['Passion Fruit Black Tea',null,null,135]
];
nonCoffee.forEach(([name,...prices]) => add('coffee','Non Coffee',name,prices,drinkSizes));
group('coffee','Coffee Frappe',['Frozen Cappuccino','Roasted Almond','Salted Caramel','Dark Chocolate','Mocha','Biscoff'],[155,155,155,155,155,185],'18 oz');
group('coffee','Drink Add-ons',['Espresso Shot','Oatside Milk','Extra Dairy Milk','Decaf','Stevia','Extra Syrup','Extra Sauce'],[30,40,30,50,20,15,25],'Add-on');
group('coffee','Non Coffee Frappe',['Strawberry Matcha','Matcha Hazelnut','Strawberry Cream','Caramel White Chocolate','Tropical Sunset Frappe','Autumn Sunrise Frappe'],[155,155,155,155,185,185],'16 oz');
group('coffee','Cream Cheese Series',['Red Velvet Cream Cheese','Matcha Cream Cheese','Ube Cream Cheese'],155,'16 oz');
group('coffee','Brewing Experience',['Syphon','Pour Over','French Press'],[200,180,180]);
group('coffee',"Twinings Tea",['Choice of Your Tea'],100,'12 oz');
group('coffee','Soda Pop',['Kiwi','Strawberry','Passion Fruit','Blueberry'],100,'18 oz');
group('sweet','Bingsu',['Strawberry','Mango','Blueberry','Passion Fruit'],155,'18 oz');
group('coffee','Other Drinks',['Coke / Coke Zero / Sprite / Royal','Minute Made Orange Juice','Bottled Water'],[105,105,25]);
module.exports = { items };
