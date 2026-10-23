import type { Metadata } from "next";
import RegistrationForm from "./RegistrationForm";
import SiteHeader from "../SiteHeader";
import { Icon, Stage } from "../ui";

export const metadata: Metadata = {
  title: "Contractor registration | Contractor Desk",
};

// Concept B device stage: a short explanation on the left (English; on a phone
// it sits above the form) and the registration screen on the right. Everything
// inside the screen is in the language the person chooses.
export default function RegisterPage() {
  return (
    <>
      <SiteHeader active="contractor" />
      <main className="flex-1">
        <Stage
          explain={
            <>
              <span className="eyebrow">For contractors in Pune</span>
              <h2 className="h1">Register once, on your phone, in your own language</h2>
              <p className="lead">
                Short, one column, big tap targets. Your trade is a tap, not a typed word, so matching stays reliable.
              </p>
              <ul className="ticks">
                <li>
                  <Icon name="globe" size={16} /> Switch language at any time. Labels change, the saved values don’t.
                </li>
                <li>
                  <Icon name="lock" size={16} /> The mobile number is private and never shown publicly.
                </li>
                <li>
                  <Icon name="info" size={16} /> Registering is not verification or a promise of work.
                </li>
              </ul>
            </>
          }
        >
          <RegistrationForm />
        </Stage>
      </main>
    </>
  );
}
