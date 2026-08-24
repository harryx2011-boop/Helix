import { SignUp } from '@clerk/nextjs';
import { AuthFrame } from '@/components/marketing/auth-frame';

export const metadata = { title: 'Create an account' };

export default function SignUpPage() {
  return (
    <AuthFrame title="Get an API key" subtitle="A helix- key is minted the moment your account exists.">
      <SignUp />
    </AuthFrame>
  );
}
