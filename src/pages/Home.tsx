import { useState } from "react";
import styles from "./Home.module.scss";

const QUOTES = [
  "Don't smile because it's over, cry because it happened.",
  "I merge code like I merge lanes.",
  "A man with no pants fears no pickpockets.",
  "A bottle of Heineken, shaken, not stirred.",
  "Bird flu? Yeah, they tend to do that.",
  "Yeah our platform is fully configurable. You configureout a way to develop your own solution."
];

function randomQuote() {
  return QUOTES[Math.floor(Math.random() * QUOTES.length)];
}

export default function Home() {
  const [quote] = useState(randomQuote);

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>sandbox</h1>
      <p className={styles.quote}>{quote}</p>
    </div>
  );
}