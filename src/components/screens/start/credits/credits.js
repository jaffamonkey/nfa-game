import styles from './credits.css';
import React from 'react';
import ExternalLink from '../externalLink/externalLink';

export default function Credits() {
    return <dl className={styles.creditsList}>
        <dt>Textures</dt>
        <dd className={styles.creditsDescription}>
            <ExternalLink href='https://freestocktextures.com/' />
            <br />
            by&nbsp;
            <ExternalLink href='https://twitter.com/pinkonhead'>
                @PinkOnHead
            </ExternalLink>
            &nbsp;and&nbsp;
            <ExternalLink href='https://twitter.com/PawelWoz'>
                @PawelWoz
            </ExternalLink>
        </dd>
        <dt>Sound effects</dt>
        <dd className={styles.creditsDescription}>
            <ExternalLink href='http://www.littlerobotsoundfactory.com/' />
            <br />
            <ExternalLink href='http://www.bigsoundbank.com/' />
            <br />
            <ExternalLink href='http://opengameart.org/' />
        </dd>
        <dt>Xbox controller driver for MacOs</dt>
        <dd className={styles.creditsDescription}>
            <ExternalLink href='https://github.com/360Controller/360Controller'>
                360Controller on GitHub
            </ExternalLink>
        </dd>
        <dt>
            <ExternalLink href='https://github.com/jaffamonkey/nfa-game'>
                Github Repo
            </ExternalLink>
        </dt>

        <dt>How to Play</dt>
        <dd className={styles.creditsDescription}>
            <strong>Controls (Keyboard)</strong><br />
            `W` — move forward<br />
            `S` — move backward<br />
            `A` — move left<br />
            `D` — move right<br />
            `Mouse/Touchpad` — look around<br />
            `SHIFT` — run<br />
            `E` — interact with stuff<br />
            `Q` — quit to main menu<br />

            <strong>Gamepad (Xbox 360/One, wired)</strong>
            <br />
            `Left stick` — move around<br />
            `Right stick` — look around<br />
            `Right trigger` — run<br />
            `X` — interact with stuff<br />
            `Back` — quit to main menu<br />
            `A` — select item in menu<br />
            `B` — go up one level in menu<br />
        </dd>
    </dl>;
}
