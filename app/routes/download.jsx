// app/routes/app/download.jsx
import { authenticate } from "../shopify.server";
import { gql } from "graphql-request";
import Papa from "papaparse";

export const action = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const productId = formData.get("productId");
  const discountAmountStr = formData.get("discountAmount");
  const discountAmount = parseFloat(discountAmountStr);

  console.log("Received productId:", productId);
  console.log("Received discountAmount:", discountAmount);

  if (isNaN(discountAmount) || discountAmount <= 0) {
    console.error("Invalid discount amount:", discountAmountStr);
    return new Response("Invalid discount amount", { status: 400 });
  }

  const ordersQuery = gql`
    {
      orders(first: 100) {
        edges {
          node {
            customer {
              id
              email
            }
            lineItems(first: 10) {
              edges {
                node {
                  product {
                    id
                  }
                }
              }
            }
          }
        }
      }
    }
  `;

  const ordersRes = await admin.graphql(ordersQuery);
  const ordersJson = await ordersRes.json();

  const customers = ordersJson.data.orders.edges
    .filter((order) =>
      order.node.lineItems.edges.some(
        (item) => item.node.product?.id === productId
      )
    )
    .map((order) => order.node.customer)
    .filter(Boolean);

  console.log("Matched customers:", customers);

  const csvRows = [];

  for (const customer of customers) {
    const code = `GRABB-${Math.random().toString(36).substring(2, 12).toUpperCase()}`;
    console.log(`Creating code for ${customer.email}...`);

    const mutation = gql`
      mutation discountCodeBasicCreate($basicCodeDiscount: DiscountCodeBasicInput!) {
        discountCodeBasicCreate(basicCodeDiscount: $basicCodeDiscount) {
          codeDiscountNode {
            id
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    const variables = {
      basicCodeDiscount: {
        title: `Grabbit - ${code}`,
        code,
        startsAt: new Date().toISOString(),
        usageLimit: 1,
        appliesOncePerCustomer: true,
        customerSelection: {
          customers: {
            add: [customer.id],
          },
        },
        customerGets: {
          items: { all: true },
          value: {
            discountAmount: {
              amount: discountAmount.toFixed(2),
              appliesOnEachItem: false,
            },
          },
        },
      },
    };

    const res = await admin.graphql(mutation, { variables });
    const resJson = await res.json();

    const errors = resJson.data?.discountCodeBasicCreate?.userErrors;
    if (errors?.length) {
      console.warn(`Error for ${customer.email}:`, errors);
      continue;
    }

    console.log(`✅ Created discount for ${customer.email}: ${code}`);
    csvRows.push({ email: customer.email, code });
  }

  console.log("Final CSV rows:", csvRows);

  const csv = Papa.unparse(csvRows);
  console.log("Generated CSV string:\n", csv);

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename=grabbit-codes.csv`,
    },
  });
};