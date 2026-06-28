import Header from "./Header/Header";
import Footer from "./Footer/Footer";

// Wraps every page with the shared header and footer to avoid repeating that structure in App.js
const PageLayout = ({ children }) => (
  <>
    <Header />
    {children}
    <Footer />
  </>
);

export default PageLayout;
