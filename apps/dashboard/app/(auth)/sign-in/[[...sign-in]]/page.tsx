import { SignIn } from '@clerk/nextjs';
import { AuthFrame } from '@/components/marketing/auth-frame';

export const metadata = { title: 'Sign in' };

export default function SignInPage() {
  return (
    <AuthFrame title="Sign in to Helix" subtitle="GitHub or Google, or email if you prefer.">
      <SignIn />
    </AuthFrame>
  );
}
