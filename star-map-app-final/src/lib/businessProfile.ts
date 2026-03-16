const businessName = (process.env.NEXT_PUBLIC_BUSINESS_NAME || "StarMapCo").trim();
const supportEmail = (process.env.NEXT_PUBLIC_SUPPORT_EMAIL || "support@starmapco.com").trim();
const supportPhone = (process.env.NEXT_PUBLIC_SUPPORT_PHONE || "7786786242").trim();
const businessAddress = (process.env.NEXT_PUBLIC_BUSINESS_ADDRESS || "").trim();
const supportHours = (process.env.NEXT_PUBLIC_SUPPORT_HOURS || "Mon-Sat 9:00 AM-5:00 PM").trim();

export type BusinessProfile = {
  name: string;
  email: string;
  phone?: string;
  address?: string;
  hours?: string;
};

function formatPhoneDisplay(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return phone;
}

function formatPhoneHref(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) {
    return `+1${digits}`;
  }
  if (digits.length === 11 && digits.startsWith("1")) {
    return `+${digits}`;
  }
  return phone;
}

export function getBusinessProfile(): BusinessProfile {
  return {
    name: businessName || "StarMapCo",
    email: supportEmail || "support@starmapco.com",
    ...(supportPhone ? { phone: formatPhoneDisplay(supportPhone) } : {}),
    ...(businessAddress ? { address: businessAddress } : {}),
    ...(supportHours ? { hours: supportHours } : {}),
  };
}

export function getBusinessPhoneHref() {
  return supportPhone ? formatPhoneHref(supportPhone) : "";
}
