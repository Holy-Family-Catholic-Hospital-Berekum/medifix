export default function Footer({ page }) {
  return (
    <footer
      className={`flex flex-col ${!page && "mt-[400px]"} justify-center gap-2 items-center bg-[#2563EB] pb-24 pt-4`}
    >
      <div className="flex justify-start">
        <div className="flex justify-center flex-col items-center mb-10">
          <h1 className="text-xl font-bold">PHIX-HFCH</h1>
          <p>We are at your service</p>
        </div>
      </div>
      <small>&copy; {new Date().getFullYear()} All rights reserved.</small>
    </footer>
  );
}
