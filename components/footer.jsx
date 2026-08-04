export default function Footer({ page }) {
  return (
    <footer
      className={`flex flex-col ${!page && "mt-[400px]"} justify-center gap-2 items-center bg-[#40499F] pb-24 pt-4`}
    >
      <div className="flex justify-start">
        <div className="flex justify-center flex-col items-center mb-10">
          <h1 className="text-xl text-[#FF8825] font-bold">PHIX-HFCH</h1>
          <p className="text-blue-200">We will phix it</p>
        </div>
      </div>
      <small>&copy; {new Date().getFullYear()} All rights reserved.</small>
      <small className="text-yellow-500 mt-4">
        Developed by:{" "}
        <a
          href="https://azumah-ernest.vercel.app/"
          className="text-white cursor-pointer border-b border-yellow-500 hover:text-yellow-500 transition"
          target="blank"
        >
          Eng. Azumah Ernest
        </a>
      </small>
    </footer>
  );
}
