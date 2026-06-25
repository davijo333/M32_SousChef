/** Serializable upload queue row — survives navigation (no File blob). */
export type StoredBillEntry = {
  id: string;
  filename: string;
  status: "queued" | "parsing" | "parsed" | "processing" | "error" | "confirmed";
  error?: string;
  expanded?: boolean;
  result?: {
    billId: string;
    vendor: string;
    billDate?: string;
    invoiceNumber?: string;
    filename: string;
    fileUrl?: string;
    lineCount: number;
    lines: unknown[];
  };
};

export type ActiveUploadFile = {
  entryId: string;
  filename: string;
};
