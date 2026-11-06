import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 開始寫入系統基礎種子資料...");

  // 1. 建立示範商家
  const merchant = await prisma.merchant.upsert({
    where: { code: "GREENFIELD" },
    create: {
      name: "青禾風格美髮沙龍 (Greenfield Salon)",
      code: "GREENFIELD",
      status: "ACTIVE",
    },
    update: {},
  });

  // 2. 建立示範分店
  const branch = await prisma.branch.upsert({
    where: { slug: "taipei-main" },
    create: {
      merchantId: merchant.id,
      name: "台北大安旗艦店",
      slug: "taipei-main",
      address: "台北市大安區忠孝東路四段 100 號",
      phone: "02-2771-0000",
      timezone: "Asia/Taipei",
      active: true,
      settings: {
        create: {
          timezone: "Asia/Taipei",
          queueEnabled: true,
          reservationEnabled: true,
          orderingEnabled: true,
          paymentEnabled: true,
          defaultServiceMinutes: 30,
          queueOpenTime: "10:00",
          queueCloseTime: "21:00",
          maxActiveTicketsPerUser: 1,
          nearTurnNotifyCount: 3,
          returnPolicy: "STAFF_DECIDES",
        },
      },
    },
    update: {},
  });

  // 3. 建立營業時間 (一到日)
  for (let weekday = 0; weekday <= 6; weekday++) {
    await prisma.businessHour.upsert({
      where: {
        branchId_weekday: {
          branchId: branch.id,
          weekday,
        },
      },
      create: {
        branchId: branch.id,
        weekday,
        openTime: "10:00",
        closeTime: "21:00",
        isClosed: weekday === 1, // 週一公休
      },
      update: {},
    });
  }

  // 4. 建立示範使用者 (Owner, Staff, Customer)
  const ownerUser = await prisma.user.upsert({
    where: { lineUserId: "U_demo_owner_01" },
    create: {
      lineUserId: "U_demo_owner_01",
      displayName: "林店長 (Owner)",
      pictureUrl: "https://api.dicebear.com/7.x/avataaars/svg?seed=owner",
    },
    update: {},
  });

  const staffUser = await prisma.user.upsert({
    where: { lineUserId: "U_demo_staff_01" },
    create: {
      lineUserId: "U_demo_staff_01",
      displayName: "小王 (Staff)",
      pictureUrl: "https://api.dicebear.com/7.x/avataaars/svg?seed=staff",
    },
    update: {},
  });

  const customerUser = await prisma.user.upsert({
    where: { lineUserId: "U_demo_customer_01" },
    create: {
      lineUserId: "U_demo_customer_01",
      displayName: "陳小姐 (顧客)",
      pictureUrl: "https://api.dicebear.com/7.x/avataaars/svg?seed=customer",
    },
    update: {},
  });

  // 5. 建立成員權限
  await prisma.merchantMember.upsert({
    where: {
      merchantId_userId: {
        merchantId: merchant.id,
        userId: ownerUser.id,
      },
    },
    create: {
      merchantId: merchant.id,
      userId: ownerUser.id,
      role: "OWNER",
      status: "ACTIVE",
    },
    update: {},
  });

  await prisma.merchantMember.upsert({
    where: {
      merchantId_userId: {
        merchantId: merchant.id,
        userId: staffUser.id,
      },
    },
    create: {
      merchantId: merchant.id,
      userId: staffUser.id,
      role: "STAFF",
      status: "ACTIVE",
    },
    update: {},
  });

  // 6. 建立菜單與服務品項 (Catalog)
  const items = [
    {
      name: "經典男女剪髮",
      type: "SERVICE",
      price: 600,
      description: "含專業頭皮洗髮、設計剪裁與吹整造型",
      durationMinutes: 45,
      sortOrder: 1,
    },
    {
      name: "深層水潤角蛋白護髮",
      type: "SERVICE",
      price: 800,
      description: "補充毛鱗片蛋白質，重現柔順光澤髮質",
      durationMinutes: 40,
      sortOrder: 2,
    },
    {
      name: "日系晶透冷暖染髮",
      type: "SERVICE",
      price: 2000,
      description: "採用低敏植萃染劑，色彩飽和持久不傷髮質",
      durationMinutes: 120,
      sortOrder: 3,
    },
    {
      name: "深層頭皮舒壓SPA (現場加點推薦)",
      type: "ADDON",
      price: 500,
      description: "溫熱精油肩頸放鬆與深層毛囊淨化調理",
      durationMinutes: 30,
      sortOrder: 4,
    },
    {
      name: "摩洛哥賦活精華髮油 (外帶商品)",
      type: "PRODUCT",
      price: 1200,
      description: "頂級堅果油萃取，抗熱防毛躁必備居家保養",
      sortOrder: 5,
    },
  ];

  for (const item of items) {
    const existing = await prisma.catalogItem.findFirst({
      where: { merchantId: merchant.id, name: item.name },
    });
    if (!existing) {
      await prisma.catalogItem.create({
        data: {
          merchantId: merchant.id,
          branchId: branch.id,
          ...item,
        },
      });
    }
  }

  // 7. 建立今日與明日預約時段 (Reservation Slots)
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const slotHours = [10, 11, 14, 15, 16, 18, 19];
  for (const targetDate of [today, tomorrow]) {
    for (const hour of slotHours) {
      const startAt = new Date(targetDate);
      startAt.setHours(hour, 0, 0, 0);
      const endAt = new Date(targetDate);
      endAt.setHours(hour + 1, 0, 0, 0);

      const existing = await prisma.reservationSlot.findFirst({
        where: {
          branchId: branch.id,
          startAt,
        },
      });

      if (!existing) {
        await prisma.reservationSlot.create({
          data: {
            branchId: branch.id,
            startAt,
            endAt,
            capacity: 3,
            bookedCount: 0,
            status: "OPEN",
          },
        });
      }
    }
  }

  console.log("✅ 基礎種子資料建立成功！");
  console.log(`- 示範商家: ${merchant.name} (ID: ${merchant.id})`);
  console.log(`- 示範門市: ${branch.name} (Slug: ${branch.slug}, ID: ${branch.id})`);
}

main()
  .catch((e) => {
    console.error("種子寫入失敗:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
