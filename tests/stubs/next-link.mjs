// Stand-in for next/link: renders a plain link so page output can be checked.
import { createElement } from "react";

export default function Link(props) {
  return createElement("a", { href: props.href }, props.children);
}
