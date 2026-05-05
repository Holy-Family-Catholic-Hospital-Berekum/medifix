export default function Footer() {
  return (
    <footer className="flex flex-col justify-center gap-2 items-center w-full bg-[#2563EB] pb-24 pt-4 ">
      <div className="flex justify-start">
        <div className="flex justify-center flex-col items-center">
          <h1 className="text-2xl font-bold">Medifix</h1>
          <p>We are at your service</p>
        </div>
      </div>
      <p>&copy; {new Date().getFullYear()} All rights reserved.</p>
    </footer>
  );
}
