import Link from "next/link";
import { raiseRequestHref } from "@/lib/fixtures";
import { Brand } from "./ui";

// The dark footer: brand and promise, the main links, and the photo credits
// (both photos are from Unsplash, free to use).
export default function SiteFooter() {
  return (
    <footer className="mk-footer">
      <div className="mk-footer-inner">
        <div className="mk-footer-top">
          <div>
            <Link href="/" className="brand" aria-label="Mera Karigar home">
              <Brand />
            </Link>
            <p>When a contractor drops out, Mera Karigar finds available karigars in Pune by trade, area and start date, so your site keeps moving.</p>
          </div>
          <div>
            <h4>For builders</h4>
            <ul>
              <li><Link href={raiseRequestHref()}>Raise a request</Link></li>
              <li><Link href="/#how">How it works</Link></li>
              <li><Link href="/#contact">Contact us</Link></li>
            </ul>
          </div>
          <div>
            <h4>For karigars</h4>
            <ul>
              <li><Link href="/register">Register as a contractor</Link></li>
              <li><Link href="/#trades">Trades we cover</Link></li>
            </ul>
          </div>
        </div>
        <div className="mk-footer-bottom">
          <span>© Mera Karigar · Pune, India. Contractors are not vetted; availability is confirmed per job.</span>
          <span>
            Photos: <a href="https://unsplash.com/photos/zc5B3H1W1E8" target="_blank" rel="noopener noreferrer">Parth Savani</a> and{" "}
            <a href="https://unsplash.com/photos/GqHIevKIl7U" target="_blank" rel="noopener noreferrer">Ankit Manoharan</a> on Unsplash
          </span>
        </div>
      </div>
    </footer>
  );
}
