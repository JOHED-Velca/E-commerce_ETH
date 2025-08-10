import { useState, FC } from "react";
import styles from "./index.module.scss";
import { Link } from "react-router-dom";
import { Product } from "../../../types/product";
import { motion } from "framer-motion";
import { useAppDispatch } from "../../../app/hooks";
import { CartItem } from "../../../types/cart";
import { addItem } from "../../../features/cart/cartSlice";
import { CgShoppingBag } from "react-icons/cg";
import Button from "../Button";
import Spinner from "../Spinner";


interface ProductCardProps {
  id: number;
  name: string;
  price: number;
  image: string;
  key?: number;
}

const ProductCard: FC<ProductCardProps> = ({
  id,
  key,
  name,
  price,
  image,
}) => {
  const dispatch = useAppDispatch();

  // const [showIcons, setShowIcons] = useState(false);
  const [isLoadingProduct, setIsLoadingProduct] = useState(false);

  // const showActionIcons = (isShow: boolean) => {
  //   isShow ? setShowIcons(true) : setShowIcons(false);
  // };

  const addToCartHandler = () => {
    setIsLoadingProduct(true);

    const cartProduct: CartItem = {
      quantity: 1,
      product: {
        id: id,
        name: name,
        price: price,
        thumbnail_url: image,
        external_id: "",
        variants: 0,
        synced: 0,
        size: "M",
      },
    };

    dispatch(addItem(cartProduct));
    setTimeout(() => setIsLoadingProduct(false), 500);
  };

  return (
    <motion.div
  id={name}
  key={key}
  tabIndex={id}
      whileHover={{ cursor: "pointer" }}
      // onMouseEnter={() => showActionIcons(true)}
      // onMouseLeave={() => showActionIcons(false)}
      whileTap={{ cursor: "grabbing" }}
      transition={{
        ease: "easeInOut",
        duration: 0.4,
      }}
    >
      <div className={styles.productItem}>
        <div className={styles.productPic}>
          <Link to={`/products/${String(id)}`}>
            {/* <img src={image} alt={title} /> */}
            <img src={image} alt={name} />
          </Link>
        </div>
      </div>
      <div className={styles.productDetailsContainer}>
        <Link
          to={`/products/${String(id)}`}
          className={styles.productDetailsWrapper}
        >
          <div className={styles.productDetails}>
            <div className={styles.productTitle}>
              <div>{name}</div>
            </div>
            <div className={styles.productPrice}>{price}$</div>
          </div>
        </Link>
        <motion.div
          key={key}
          whileHover={{ zoom: 1.2 }}
          style={{ height: "100%" }}
          onClick={() => addToCartHandler()}
        >
          <Button className={styles.iconCcontainer}>
            {isLoadingProduct && <Spinner className={"addToCart"} />}
            <CgShoppingBag
              className={`${styles.icon} ${
                isLoadingProduct && styles.loadingIcon
              }`}
            />
          </Button>
        </motion.div>
      </div>
    </motion.div>
  );
};

export default ProductCard;