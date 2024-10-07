(impl-trait 'SP2PABAF9FTAJYNFZH93XENAJ8FVY99RRM50D2JG9.nft-trait.nft-trait)

(define-constant DEPLOYER tx-sender)

(define-data-var nextId uint u1)

(define-data-var urlBase (string-ascii 128) "https://bitcoinfaces.xyz/api/get-image")
(define-data-var urlParam (string-ascii 128) "?name=")

;; trying something creative here
(define-data-var url (string-ascii 256) (concat (var-get urlBase) (var-get urlParam)))

;; to store addresses by nft id
;; maybe this is where we put the buff?
(define-map Addresses uint principal)

(define-non-fungible-token bitcoin-faces uint)

(define-read-only (get-last-token-id) (ok (- (var-get nextId) u1)))

;; one way to concat and get the optional is as-max-len?
;; but feels like it exposes weird issues with long strings
;; TODO: can we compute longest string length of Stacks address
;; and check that against what's being set for the url values?
(define-read-only (get-token-uri (id uint))
  (ok (as-max-len? (concat (var-get url) (int-to-ascii id)) u256))
)

(define-read-only (get-owner (id uint)) (ok (nft-get-owner? bitcoin-faces id)))

;; for accessing the new map
(define-read-only (get-face-address (id uint)) (map-get? Addresses id))

(define-public (transfer (id uint) (from principal) (to principal))
  (if (or (is-eq from tx-sender) (is-eq from contract-caller))
    (nft-transfer? bitcoin-faces id from to)
    (err u4)
  )
)

(define-public (burn (id uint) (from principal))
  (if (or (is-eq from tx-sender) (is-eq from contract-caller))
    (nft-burn? bitcoin-faces id from)
    (err u4)
  )
)

(define-public (mint (to principal))
  (let ((id (var-get nextId)))
    (asserts! (is-eq DEPLOYER (get-standard-caller)) (err u401))
    (var-set nextId (+ id u1))
    (nft-mint? bitcoin-faces id to)
  )
)

(define-public (set-url (base (string-ascii 128)) (param (string-ascii 128)))
  (if (is-eq DEPLOYER (get-standard-caller))
    (ok (and (var-set urlBase base) (var-set urlParam param)))
    (err u401)
  )
)

(define-public (airdrop (l1 (list 5000 principal)) (l2 (list 5000 principal)) (l3 (list 4995 principal)))
  (if (is-eq DEPLOYER (get-standard-caller))
    (ok (var-set nextId (fold drop l3 (fold drop l2 (fold drop l1 (var-get nextId))))))
    (err u401)
  )
)

(define-private (drop (to principal) (id uint))
  (begin (is-err (nft-mint? bitcoin-faces id to)) (+ id u1))
)

(define-read-only (get-standard-caller)
  (let ((d (unwrap-panic (principal-destruct? contract-caller))))
    (unwrap-panic (principal-construct? (get version d) (get hash-bytes d)))
  )
)
