import { redirect } from 'next/navigation'

// Share cards became the Marketing page.
export default function SharePage() {
  redirect('/marketing')
}
