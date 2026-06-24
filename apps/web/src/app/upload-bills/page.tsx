import { redirect } from "next/navigation";

/** Legacy route — use /upload-orders */
export default function UploadBillsRedirect() {
  redirect("/upload-orders");
}
