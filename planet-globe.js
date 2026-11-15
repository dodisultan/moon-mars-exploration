(() => {
  const container = document.getElementById('planet-art');
  const status = document.getElementById('globe-status');
  const controls = ['globe-rotation', 'globe-zoom-out', 'globe-zoom-in', 'globe-reset']
    .map((id) => document.getElementById(id));
  if (!container || !status || controls.some((control) => !control)) return;

  let renderer, camera, planet, grid, body = 'Earth', rotating = true, distance = 3.4;
  const palette = { Earth: 0x397d91, Moon: 0x9a9991, Mars: 0xb85c3b };
  const lightPalette = { Earth: 0x98c1b6, Moon: 0xd3d0c4, Mars: 0xe9a46f };

  function setBody(nextBody, THREE) {
    body = palette[nextBody] ? nextBody : 'Earth';
    planet.material.color.setHex(palette[body]);
    planet.material.emissive.setHex(palette[body]);
    planet.material.emissiveIntensity = 0.06;
    grid.material.color.setHex(lightPalette[body]);
    container.setAttribute('aria-label', `Illustrative 3D ${body} globe; no terrain data`);
  }

  function setDistance(nextDistance) {
    distance = Math.min(4.4, Math.max(2.0, nextDistance));
    camera.position.z = distance;
  }

  async function initialize() {
    try {
      const THREE = await import('https://cdn.jsdelivr.net/npm/three@0.177.0/build/three.module.js');
      const scene = new THREE.Scene();
      camera = new THREE.PerspectiveCamera(36, 1, 0.1, 30);
      setDistance(distance);

      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setClearColor(0x000000, 0);
      container.append(renderer.domElement);

      planet = new THREE.Mesh(
        new THREE.SphereGeometry(1, 48, 36),
        new THREE.MeshStandardMaterial({ color: palette[body], roughness: 0.91, metalness: 0.02 })
      );
      scene.add(planet);

      const gridPositions = [];
      for (let latitude = -75; latitude <= 75; latitude += 15) {
        const phi = THREE.MathUtils.degToRad(90 - latitude);
        for (let step = 0; step < 96; step += 1) {
          const a = (step / 96) * Math.PI * 2;
          const b = ((step + 1) / 96) * Math.PI * 2;
          gridPositions.push(Math.sin(phi) * Math.cos(a), Math.cos(phi), Math.sin(phi) * Math.sin(a));
          gridPositions.push(Math.sin(phi) * Math.cos(b), Math.cos(phi), Math.sin(phi) * Math.sin(b));
        }
      }
      for (let longitude = 0; longitude < 180; longitude += 30) {
        const theta = THREE.MathUtils.degToRad(longitude);
        for (let step = 0; step < 48; step += 1) {
          const a = (step / 48) * Math.PI;
          const b = ((step + 1) / 48) * Math.PI;
          gridPositions.push(Math.sin(a) * Math.cos(theta), Math.cos(a), Math.sin(a) * Math.sin(theta));
          gridPositions.push(Math.sin(b) * Math.cos(theta), Math.cos(b), Math.sin(b) * Math.sin(theta));
        }
      }
      const gridGeometry = new THREE.BufferGeometry();
      gridGeometry.setAttribute('position', new THREE.Float32BufferAttribute(gridPositions, 3));
      grid = new THREE.LineSegments(gridGeometry, new THREE.LineBasicMaterial({
        color: lightPalette[body], transparent: true, opacity: 0.22
      }));
      grid.scale.setScalar(1.004);
      scene.add(grid);

      scene.add(new THREE.AmbientLight(0xffffff, 1.15));
      const keyLight = new THREE.DirectionalLight(0xffffff, 2.2);
      keyLight.position.set(-2.5, 2.5, 4);
      scene.add(keyLight);

      function resize() {
        const bounds = container.getBoundingClientRect();
        if (!bounds.width || !bounds.height) return;
        renderer.setSize(bounds.width, bounds.height, false);
        camera.aspect = bounds.width / bounds.height;
        camera.updateProjectionMatrix();
      }
      const observer = new ResizeObserver(resize);
      observer.observe(container);
      resize();

      let pointer = null;
      renderer.domElement.addEventListener('pointerdown', (event) => {
        pointer = { id: event.pointerId, x: event.clientX, y: event.clientY };
        renderer.domElement.setPointerCapture(event.pointerId);
      });
      renderer.domElement.addEventListener('pointermove', (event) => {
        if (!pointer || pointer.id !== event.pointerId) return;
        planet.rotation.y += (event.clientX - pointer.x) * 0.008;
        planet.rotation.x = THREE.MathUtils.clamp(
          planet.rotation.x + (event.clientY - pointer.y) * 0.008, -1.2, 1.2
        );
        pointer.x = event.clientX;
        pointer.y = event.clientY;
      });
      const stopDragging = () => { pointer = null; };
      renderer.domElement.addEventListener('pointerup', stopDragging);
      renderer.domElement.addEventListener('pointercancel', stopDragging);
      renderer.domElement.addEventListener('wheel', (event) => {
        event.preventDefault();
        setDistance(distance + Math.sign(event.deltaY) * 0.22);
      }, { passive: false });

      controls.forEach((control) => { control.disabled = false; });
      controls[0].addEventListener('click', () => {
        rotating = !rotating;
        controls[0].textContent = rotating ? 'Pause rotation' : 'Resume rotation';
        controls[0].setAttribute('aria-pressed', String(rotating));
      });
      controls[1].addEventListener('click', () => setDistance(distance + 0.25));
      controls[2].addEventListener('click', () => setDistance(distance - 0.25));
      controls[3].addEventListener('click', () => {
        planet.rotation.set(0, 0, 0);
        setDistance(3.4);
      });
      window.addEventListener('planet-body-change', (event) => setBody(event.detail, THREE));
      status.textContent = 'Illustrative globe only · drag to rotate · scroll or use controls to zoom. No imagery, site markers, or terrain data.';

      function animate() {
        window.requestAnimationFrame(animate);
        if (rotating) planet.rotation.y += 0.0015;
        grid.rotation.copy(planet.rotation);
        renderer.render(scene, camera);
      }
      animate();
    } catch (error) {
      status.textContent = '3D globe unavailable (WebGL or CDN unavailable); the labeled illustration remains. No terrain data is shown.';
      console.warn('3D globe could not be initialized:', error);
    }
  }

  initialize();
})();
