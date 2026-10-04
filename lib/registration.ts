type RegistrationProfile = {
  first_name?: string | null;
  last_name?: string | null;
  date_of_birth?: string | null;
  age_verified_at?: string | null;
  tos_accepted_at?: string | null;
};

export function registrationComplete(profile: RegistrationProfile | null | undefined): boolean {
  if (!profile?.first_name?.trim() || !profile.last_name?.trim() ||
      !profile.age_verified_at || !profile.tos_accepted_at || !profile.date_of_birth) return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(profile.date_of_birth);
  if (!match) return false;
  const [year, month, day] = match.slice(1).map(Number);
  const dob = new Date(year, month - 1, day);
  if (dob.getFullYear() !== year || dob.getMonth() !== month - 1 || dob.getDate() !== day) return false;
  const today = new Date();
  let age = today.getFullYear() - year;
  if (today.getMonth() < month - 1 || (today.getMonth() === month - 1 && today.getDate() < day)) age--;
  return age >= 18;
}
