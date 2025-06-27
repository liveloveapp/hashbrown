import { faker } from '@faker-js/faker';

faker.seed(123);

function generateProductData(count: number) {
  const minPrice = 100;
  const maxPrice = 1000;
  const price = faker.number.int({ min: minPrice, max: maxPrice });

  return Array.from({ length: count }, () => ({
    id: faker.string.uuid(),
    name: faker.commerce.productName(),
    price,
    cost: price * 0.75,
    description: faker.commerce.productDescription(),
  }));
}

function generateSalesData() {
  const salesData = [];
  const currentDate = new Date();
  const startYear = currentDate.getFullYear() - 5;

  for (let year = startYear; year <= startYear + 5; year++) {
    for (let month = 0; month < 12; month++) {
      const date = new Date(year, month, 1);
      const sales = faker.number.int({ min: 100, max: 1000 });

      salesData.push({
        date: date.toISOString(),
        sales,
      });
    }
  }

  return salesData;
}

export function generateCommerceData(count: number) {
  const productData = generateProductData(count);
  const salesData = productData.map((product) => {
    return {
      ...product,
      sales: generateSalesData(),
    };
  });
  return salesData;
}
