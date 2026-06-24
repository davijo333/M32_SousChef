import { PLACEHOLDER_KITCHEN_NAME } from "@/lib/kitchen-name";
import { connectDB } from "@/lib/mongodb";
import { Restaurant } from "@/models/Restaurant";
import { User } from "@/models/User";
import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";

const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  chefName: z.string().min(1),
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { email, password, chefName } = signupSchema.parse(body);

    await connectDB();

    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) {
      return NextResponse.json({ error: "Email already registered" }, { status: 400 });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({
      email: email.toLowerCase(),
      passwordHash,
      name: chefName.trim(),
    });

    // One restaurant per signup for now; v2 will let chefs join an existing restaurant.
    const restaurant = await Restaurant.create({
      name: PLACEHOLDER_KITCHEN_NAME,
      kitchenNameSet: false,
      isSeeded: false,
      createdBy: user._id,
      userId: user._id,
    });

    user.restaurantId = restaurant._id;
    await user.save();
    restaurant.createdBy = user._id;
    restaurant.userId = user._id;
    await restaurant.save();

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.flatten() }, { status: 400 });
    }
    console.error(err);
    return NextResponse.json({ error: "Signup failed" }, { status: 500 });
  }
}
